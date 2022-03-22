import * as vscode from 'vscode';
import { assert, addSlashes } from './debug';
import { DocumentScanner, char } from './document-scanner';

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

class Token {
    // offset refers to index into document of the starting character of the token.
    // deltaOffset means offset of the starting character of the token
    // relative to the previous token's starting offset, ie
    // start of token[i] = sum over n from n = 0 .. i - 1 token[n].deltaOffset
    // start of token[0] = token[0].deltaOffset = 0
    deltaOffset: number;
    length: number;
    type: SyntaxCode;
    data: any;

    constructor(deltaOffset: number, length: number, type: SyntaxCode, data: any) {
        this.deltaOffset = deltaOffset;
        this.length = length;
        this.type = type;
        this.data = data;
    }
}

function isAscii(ch: char): boolean {
    return ch.charCodeAt(0) <= 127;
}

function isValidOpeningCharacters(chars: string): boolean {
    return Array.from(chars).every(c => "{[(<".indexOf(c) != -1);
}

function getListOpeningCharacters(): string {
    const packageJson = require("../package.json");
    const config = vscode.workspace.getConfiguration(packageJson.name);
    const configListCharacters = config.get("listCharacters");
    if ((typeof configListCharacters === 'string' || configListCharacters instanceof String) && configListCharacters.length > 0) {
        // Filter out punctuations
        let candidates = Array.from(configListCharacters).filter(c => ",'\" ".indexOf(c) == -1).join("");
        if (isValidOpeningCharacters(candidates)) {
            return String(candidates); // Convert String to string, btw opposite is new String(...)
        }
    }
    
    return "{";
}

function getListClosingCharacters(): string {
    const opposite = Array.from(getListOpeningCharacters()).map(c => { 
        return c == "("       ? String.fromCharCode((c.charCodeAt(0) + 1)) :
        "{[<".indexOf(c) >= 0 ? String.fromCharCode((c.charCodeAt(0) + 2))
                              : assert(false, "Invalid list opening character.")
    });
    return opposite.join("");
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

    if (getListOpeningCharacters().indexOf(ch) != -1) {
        return SyntaxCode.Open;
    } else if (getListClosingCharacters().indexOf(ch) != -1) {
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

/*++

Routine Description:

    Scans to end of string.

Parameters:

    doc - Scanning context.

    from - Position to start scanning.

    kind - A character representing kind of quote, " ' or `.

Return Value:

    Returns the first character after the closing quote of the string if the
    string is well-formed.

--*/
function scanStringForward(doc: DocumentScanner, from: number, kind: char): number {
    doc.reportScanningStart(from, `kind: ${addSlashes(kind)}`);

    let pos = from;
    const stop = doc.documentEnd();
    
    while (pos < stop) {
        const ch = doc.fetchChar(pos);
        ++pos;
        
        const code = syntax(doc.editor.document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.String:
                if (kind == ch) {
                    doc.reportScanningStop(pos, "");
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

    doc - Scanning context.

    from - Position to start scanning.

    kind - A character representing kind of quote, " ' or `.

Return Value:

    Returns the position one character before the beginning of the string assuming the string
    is well-formed.

--*/
function scanStringBackward(doc: DocumentScanner, from: number, kind: char): number {
    doc.reportScanningStart(from, `kind: ${addSlashes(kind)}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    let pos = from;

    const stop = doc.documentBegin();
    
    while (pos > stop) {
        --pos;
        const ch = doc.fetchChar(pos);
        
        const code = syntax(document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.String:
                // Make sure ch is not quoted.
                if (kind == ch && 
                    (pos == stop || syntax(document.languageId, doc.fetchChar(pos)) != SyntaxCode.Escape)) {
                        doc.reportScanningStop(pos, "");
                        return pos;
                }

                break;
        }
        
        // Hack to make this work if starting scan in middle of string.
        if (ch == "\n") {
            doc.reportScanningStop(pos, "");
            return pos;
        }
    }

    throw new Error("Unbalanced string missing starting quote.");
    return pos;
}

/*++

Routine Description:

    Scans forward until we find a character.

Parameters:

    doc - Scanning context.

    from - Position to start scanning.

    stopChar - Stop scanning when we find this character.

    stopChar1 - If not undefined we only stop scanning if stopChar1 follows stopChar.

Return Value:

    Returns the first character after the last stop character, ie after stopChar1 if defined,
    if not then after stopChar.

--*/
function scanForwardUntil(doc: DocumentScanner, from: number, stopChar: char, stopChar1?: char): number {
    doc.reportScanningStart(from, `stopChar: ${addSlashes(stopChar)} \
        stopChar1: ${stopChar1 ? addSlashes(stopChar1) : "none"}`);

    let pos = from;
    const stop = doc.documentEnd();
    
    while (pos < stop) {
        const ch = doc.fetchChar(pos);
        ++pos;
        
        const code = syntax(doc.editor.document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.Escape:
                if (pos == stop) {
                    throw new Error("Unexpected end of file in scanForwardUntil.");
                }
                // Ignore the next character.
                ++pos;
                break;
            default:
                if (ch == stopChar && (!stopChar1 || doc.fetchChar(pos) == stopChar1)) {
                    doc.reportScanningStop(pos, "");            
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

    doc - Scanning context.

    from - Position to start scanning.

    stopChar - Stop scanning when we find this character.

    stopChar1 - If not undefined we only stop scanning if stopChar1 precedes stopChar.

Return Value:

    Returns the first character before the first stop character, ie before stopChar1 if defined,
    if not then before stopChar.

--*/
function scanBackwardUntil(doc: DocumentScanner, from: number, stopChar: char, stopChar1?: char): number {
    doc.reportScanningStart(from, `stopChar: ${addSlashes(stopChar)} \
        stopChar1: ${stopChar1 ? addSlashes(stopChar1) : "none"}`);

    const stop = doc.documentBegin();
    
    const searchChars = stopChar + (stopChar1 || '');
    const searchCount = searchChars.length;

    let pos = from;
    let searchIndex = 0;

    while (pos > stop && searchIndex < searchCount) {
        --pos;
        const ch = doc.fetchChar(pos);
        
        //const code = syntax(doc.editor.document.languageId, ch);
        // Make sure ch is not quoted.
        if (ch == searchChars[searchIndex] 
            && (pos == stop || syntax(doc.editor.document.languageId, doc.fetchChar(pos)) != SyntaxCode.Escape)) {
            ++searchIndex;
        } else {
            searchIndex = 0;
        }
    }

    if (searchIndex == searchCount) {
        doc.reportScanningStop(pos, "");
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

    doc - Scanning context.

    from - Starting position for scanning.

    count - Number of lists to scan for before stopping. Positive means we scan forward
            and negative means we scan backwards.

    depth - Initial depth to start counting from. Depth is increased each time
            and open list character is encountered and decreased each time
            a close list character is encountered. A positive initial depth
            will exit list enclosing `from`.

--*/
export function scanLists(doc: DocumentScanner, from: number, count: number, depth: number): number {
    doc.reportScanningStart(from, `count: ${count} depth: ${depth}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;

    // Last character is always new line.
    const stop = count > 0 ? doc.documentEnd() : 0;

    // Fail if depth gets below minDepth.
    const minDepth = depth > 0 ? 0 : depth;

    let pos = from;

    while (count > 0) {
        countOnce:
        while (pos != stop) {
            const ch = doc.fetchChar(pos);
            ++pos;
            
            const code = syntax(
                document.languageId,
                ch,
                pos != stop ? doc.fetchChar(pos) : undefined);
            
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
                    pos = scanStringForward(doc, pos, ch);
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
                    pos = scanForwardUntil(doc, pos, "\n");
                    break;
                case SyntaxCode.MultiLineCommentStart:
                    pos = scanForwardUntil(doc, pos, "*", "/");
                    break;
                case SyntaxCode.MultiLineCommentEnd:
                    break;
            }

            if (depth < minDepth) {
                throw new Error(`Depth fell below minimum at ${doc.offsetToLineColumn(pos)}`);
            }
        }

        if (pos == stop && depth != 0) {
            throw new Error("Unexpected end of file in scanLists.");
        }

        --count;
    }

    while (count < 0) {
        countOnce2:
        while (pos != stop) {
            --pos;
            const ch = doc.fetchChar(pos);
            
            const code = syntax(
                document.languageId,
                ch,
                pos != stop ? doc.fetchChar(pos-1) : undefined);
            
            switch (code) {
                case SyntaxCode.Open:
                    if (--depth == 0)
                        break countOnce2;
                    break;
                case SyntaxCode.Close:
                    if (++depth == 0)
                        break countOnce2;
                    break;
                case SyntaxCode.String:
                    pos = scanStringBackward(doc, pos, ch);
                    break;
                case SyntaxCode.SingleLineComment:
                    // syntax() should have verified that the next character is also a /.
                    //--pos;
                    // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
                    //pos = scanForwardUntil(pos, "\n");
                    break;
                case SyntaxCode.MultiLineCommentStart:
                    // The end of the comment actually looks like a start due to antisymmetry.
                    pos = scanBackwardUntil(doc, pos, "*", "/");
                    break;
                case SyntaxCode.MultiLineCommentEnd:
                    break;
            }

            if (depth < minDepth) {
                throw new Error(`Depth fell below minimum at ${doc.offsetToLineColumn(pos)}`);
            }
        }

        if (pos == stop && depth != 0) {
            throw new Error("Unexpected beginning of file in scanLists.");
        }

        ++count;
    }

    doc.reportScanningStop(pos, "");
    return pos;
}

export function lex(doc: DocumentScanner): Array<Token> {
    const stop = doc.documentEnd();

    let pos = 0;

    // while (pos != stop) {
    //     const ch = doc.fetchChar(pos);
    //     ++pos;
        
    //     const code = syntax(
    //         document.languageId,
    //         ch,
    //         pos != stop ? doc.fetchChar(pos) : undefined);
        
    //     switch (code) {
    //         case SyntaxCode.Open:
    //             if (++depth == 0)
    //                 break countOnce;
    //             break;
    //         case SyntaxCode.Close:
    //             if (--depth == 0)
    //                 break countOnce;
    //             break;
    //         case SyntaxCode.String:
    //             pos = scanStringForward(doc, pos, ch);
    //             break;
    //         case SyntaxCode.Escape:
    //             // There shouldn't be random escape characters
    //             // in code, only parse this in case we started scanning
    //             // in the middle of a string. In which case we do our best.
    //             if (pos == stop) {
    //                 throw new Error("scanLists unexpected escape character.");
    //             }
    //             // Ignore the next character.
    //             ++pos;
    //             break;
    //         case SyntaxCode.SingleLineComment:
    //             // syntax() should have verified that the next character is also a /.
    //             ++pos;
    //             // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
    //             pos = scanForwardUntil(doc, pos, "\n");
    //             break;
    //         case SyntaxCode.MultiLineCommentStart:
    //             pos = scanForwardUntil(doc, pos, "*", "/");
    //             break;
    //         case SyntaxCode.MultiLineCommentEnd:
    //             break;
    //     }

    // }
    return [];
}
