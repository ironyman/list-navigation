import * as vscode from 'vscode';
import { DbgChannel, assert } from './debug';

enum SyntaxCode {
    Whitespace, /* for a whitespace character, or a syntax code that we don't care about */
    Word,     /* for a word constituent, might not need this */
    Open,     /* for a beginning delimiter */
    Close,      /* for an ending delimiter */
    String,     /* for a string-grouping character like Lisp " */
    Escape,     /* for a character that begins a C-style escape, we need to care about escapes
                    to prevent prematurely terminating string parsing */


    // By comments I mean C and C++ style comments.
    SingleLineComment,    /* for a comment-starting character for single line */
    MultiLineCommentStart, /* for a comment-starting character  */
    MultiLineCommentEnd, /* for a comment-ending character  */
}

// If I could do parameterized type or concept
// I would make char a string of length 1
// but since I can't I'll just put that here in comments.
type char = string

function isAscii(ch: char): boolean {
    return ch.charCodeAt(0) <= 127;
}

/*++

Parameters:

    languageId: VSCode language id string that specifies which language we're parsing.

    ch: Current character.

    ch1: Next character.

--*/
function syntax(languageId: string, ch: char, ch1?: char): SyntaxCode {
    if (!isAscii(ch))
        return SyntaxCode.Whitespace;

    // const ch1Str = String.fromCharCode(ch1);

    assert(ch.length == 1 && (!ch1 || ch1.length == 1));
    
    const cLike = ['c', 'cpp', 'json', 'jsonc', 'javascript', 'typescript'];
    assert(cLike.indexOf(languageId) != -1, "Unsupported language");

    if ("[{(".indexOf(ch) != -1) {
        return SyntaxCode.Open;
    } else if ("]})".indexOf(ch) != -1) {
        return SyntaxCode.Close;
    } else if ("\"'`".indexOf(ch) != -1) {
        return SyntaxCode.String;
    } else if ("\\".indexOf(ch) != -1) {
        return SyntaxCode.Escape;
    }

    if (ch1 == undefined) {
        return SyntaxCode.Whitespace;
    }

    // Handle comments. The languages we support all have same style of comments.
    if (ch == "/" && ch1 == "/") {
        return SyntaxCode.SingleLineComment;
    } else if (ch == "/" && ch1 == "*") {
        return SyntaxCode.MultiLineCommentStart;
    } else if (ch == "*" && ch1 == "/") {
        return SyntaxCode.MultiLineCommentEnd;
    }

    return SyntaxCode.Whitespace;
}

function addSlashes(str: string): string {
    return JSON.stringify(str).slice(1,-1);
}

export class DocumentScanner {
    editor: vscode.TextEditor;
    documentText: string;
    documentTextPos: number;

    constructor(editor: vscode.TextEditor) {
        this.editor = editor;
        this.documentText = editor.document.getText();
        this.documentTextPos = editor.document.offsetAt(editor.selection.active);
    }

    static fromActiveEditor(): DocumentScanner {
        return new DocumentScanner(vscode.window.activeTextEditor!!);
    }

    fetchChar(pos: number): char {
        return this.documentText[pos];
    }

    documentEnd(): number {
        return this.documentText.length -1;
    }

    documentBegin(): number {
        return 0;
    }

    reportScanningStart(from: number, msg: string) {
        DbgChannel.appendLine(`Scan from ${this.offsetToLineColumn(from)} - ${msg}`);
    }

    offsetToLineColumn(offset: number): string {
        const pos = this.editor.document.positionAt(offset);
        return `${pos.line + 1}:${pos.character + 1}`;
    }
        
    /*++

    Routine Description:

        Scans to end of string.

    Parameters:

        from - Position to start scanning.

        kind - A character representing kind of quote, " ' or `.

    Return Value:

        Returns the first character after the closing quote of the string if the
        string is well-formed.

    --*/
    scanStringForward(from: number, kind: char): number {
        this.reportScanningStart(from, `scanStringForward kind: ${kind}`);

        let pos = from;
        const stop = this.documentEnd();
        
        while (pos < stop) {
            const ch = this.fetchChar(pos);
            ++pos;
            
            const code = syntax(this.editor.document.languageId, ch);
            
            switch (code) {
                case SyntaxCode.String:
                    if (kind == ch) {
                        return pos;
                    }
                    break;
                case SyntaxCode.Escape:
                    if (pos == stop) {
                        throw new Error("Unbalanced string missing closing quote.");
                    }
                    // Ignore the next character.
                    ++pos;
                    break;
            }
        }
        
        throw new Error("Unbalanced string missing closing quote.");

        return pos;
    }

    /*++

    Routine Description:

        Scans to beginning of string.

    Parameters:

        from - Position to start scanning.

        kind - A character representing kind of quote, " ' or `.

    Return Value:

        Returns the position one character before the beginning of the string assuming the string
        is well-formed.

    --*/
    scanStringBackward(from: number, kind: char): number {
        this.reportScanningStart(from, `scanStringBackward kind: ${kind}`);

        const editor = vscode.window.activeTextEditor!!;
        const document = editor.document!!;
        let pos = from;

        const stop = this.documentBegin();
        
        while (pos > stop) {
            const ch = this.fetchChar(pos);
            --pos;
            
            const code = syntax(document.languageId, ch);
            
            switch (code) {
                case SyntaxCode.String:
                    // Make sure ch is not quoted.
                    if (kind == ch && 
                        (pos == stop || syntax(document.languageId, this.fetchChar(pos)) != SyntaxCode.Escape)) {
                        return pos;
                    }
                    break;
            }
        }

        throw new Error("Unbalanced string missing starting quote.");
        return pos;
    }

    /*++

    Routine Description:

        Scans forward until we find a character.

    Parameters:

        from - Position to start scanning.

        stopChar - Stop scanning when we find this character.

        stopChar1 - If not undefined we only stop scanning if stopChar1 follows stopChar.

    Return Value:

        Returns the first character after the last stop character, ie after stopChar1 if defined,
        if not then after stopChar.

    --*/
    scanForwardUntil(from: number, stopChar: char, stopChar1?: char): number {
        this.reportScanningStart(from, `scanForwardUntil stopChar: ${addSlashes(stopChar)} \
            stopChar1: ${stopChar1 ? addSlashes(stopChar1) : "none"}`);

        let pos = from;
        const stop = this.documentEnd();
        
        while (pos < stop) {
            const ch = this.fetchChar(pos);
            ++pos;
            
            const code = syntax(this.editor.document.languageId, ch);
            
            switch (code) {
                case SyntaxCode.Escape:
                    if (pos == stop) {
                        throw new Error("Unexpected end of file in scanForwardUntil.");
                    }
                    // Ignore the next character.
                    ++pos;
                    break;
                default:
                    if (ch == stopChar && (!stopChar1 || this.fetchChar(pos) == stopChar1)) {
                        return pos;
                    }
                    break;
            }
        }

        throw new Error("Unexpected end of file in scanForwardUntil.");
        return pos;
    }

    /*++

    Routine Description:

        Scans backward until we find a character.

    Parameters:

        from - Position to start scanning.

        stopChar - Stop scanning when we find this character.

        stopChar1 - If not undefined we only stop scanning if stopChar1 precedes stopChar.

    Return Value:

        Returns the first character before the first stop character, ie before stopChar1 if defined,
        if not then before stopChar.

    --*/
    scanBackwardUntil(from: number, stopChar: char, stopChar1?: char): number {
        this.reportScanningStart(from, `scanBackwardUntil stopChar: ${addSlashes(stopChar)} \
            stopChar1: ${stopChar1 ? addSlashes(stopChar1) : "none"}`);

        const stop = this.documentBegin();
        
        const searchChars = stopChar + (stopChar1 || '');
        const searchCount = searchChars.length;

        let pos = from;
        let searchIndex = 0;

        while (searchIndex < searchCount) {
            while (pos > stop) {
                const ch = this.fetchChar(pos);
                --pos;
                
                //const code = syntax(this.editor.document.languageId, ch);
                // Make sure ch is not quoted.
                if (ch == searchChars[searchIndex] 
                    && (pos == stop || syntax(this.editor.document.languageId, this.fetchChar(pos)) != SyntaxCode.Escape)) {
                    ++searchIndex;
                } else {
                    searchIndex = 0;
                }
            }
        }

        if (searchIndex == searchCount) {
            return pos;
        }
        throw new Error("scanBackwardUntil stop characters not found.");
    }

    /*++

    Routine Description:

        Scans starting from position `from`, for `count` lists until both
        `depth` equal zero and return the position where scanning stopped.

        By list we mean something can be balanced like () or {} or []. Although "" looks
        balanced we ignore those.
        
    Parameters:

        from - Starting position for scanning.

        count - Number of lists to scan for before stopping. Positive means we scan forward
                and negative means we scan backwards.

        depth - Initial depth to start counting from. Depth is increased each time
                and open list character is encountered and decreased each time
                a close list character is encountered. A positive initial depth
                will exit list enclosing `from`.

    --*/
    scanLists(from: number, count: number, depth: number): number {
        this.reportScanningStart(from, `scanLists count: ${count} depth: ${depth}`);

        const editor = vscode.window.activeTextEditor!!;
        const document = editor.document!!;

        // Last character is always new line.
        const stop = count > 0 ? this.documentText.length - 1 : 0;

        // Fail if depth gets below minDepth.
        const minDepth = depth > 0 ? 0 : depth;

        let pos = from;

        while (count > 0) {
            countOnce:
            while (pos != stop) {
                const ch = this.fetchChar(pos);
                ++pos;
                
                const code = syntax(
                    document.languageId,
                    ch,
                    pos != stop ? this.fetchChar(pos) : undefined);
                
                switch (code) {
                    case SyntaxCode.Open:
                        if (++depth == 0)
                            break countOnce;
                        break;
                    case SyntaxCode.Close:
                        if (--depth == 0)
                            break countOnce;
                        break;
                    case SyntaxCode.String:
                        pos = this.scanStringForward(pos, ch);
                        break;
                    case SyntaxCode.Escape:
                        // There shouldn't be random escape characters
                        // in code, only parse this in case we started scanning
                        // in the middle of a string. In which case we do our best.
                        if (pos == stop) {
                            throw new Error("scanLists unexpected escape character.");
                        }
                        // Ignore the next character.
                        ++pos;
                        break;
                    case SyntaxCode.SingleLineComment:
                        // syntax() should have verified that the next character is also a /.
                        ++pos;
                        // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
                        pos = this.scanForwardUntil(pos, "\n");
                        break;
                    case SyntaxCode.MultiLineCommentStart:
                        pos = this.scanForwardUntil(pos, "*", "/");
                        break;
                    case SyntaxCode.MultiLineCommentEnd:
                        break;
                }

                if (depth < minDepth) {
                    throw new Error(`Depth fell below minimum at ${this.offsetToLineColumn(pos)}`);
                }
            }
            if (pos == stop && depth != 0) {
                throw new Error("Unexpected end of file in scanLists.");
            }
            --count;
        }

        while (count < 0) {
            countOnce:
            while (pos != stop) {
                --pos;
                const ch = this.fetchChar(pos);
                
                const code = syntax(
                    document.languageId,
                    ch,
                    pos != stop ? this.fetchChar(pos) : undefined);
                
                switch (code) {
                    case SyntaxCode.Open:
                        if (--depth == 0)
                            break countOnce;
                        break;
                    case SyntaxCode.Close:
                        if (++depth == 0)
                            break countOnce;
                        break;
                    case SyntaxCode.String:
                        pos = this.scanStringBackward(pos, ch);
                        break;
                    case SyntaxCode.SingleLineComment:
                        // syntax() should have verified that the next character is also a /.
                        //--pos;
                        // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
                        //pos = scanForwardUntil(pos, "\n");
                        break;
                    case SyntaxCode.MultiLineCommentStart:
                        break;
                    case SyntaxCode.MultiLineCommentEnd:
                        pos = this.scanBackwardUntil(pos, "*", "/");
                        break;
                }
            }
            if (pos == stop && depth != 0) {
                throw new Error("Unexpected beginning of file in scanLists.");
            }
            
            if (depth < minDepth) {
                throw new Error(`Depth fell below minimum at ${this.offsetToLineColumn(pos)}`);
            }
            ++count;
        }

        return pos;
    }
}