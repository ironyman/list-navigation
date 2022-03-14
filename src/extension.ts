import * as vscode from 'vscode';

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
// Or maybe, too much work actually, there's no type conversion operator
// class Char {
//     ch: string;
//     constructor(ch: string) {
//         assert(ch.length == 1, "Char is a string of length 1.");
//         this.ch = ch;
//     }
// }

// function AssertionError(this: any, msg?: string)
// {
//     this.msg = msg;
// }
class AssertionError extends Error {
    msg?: string;
    constructor(msg?: string) {
        super(msg);
        this.msg = msg;
    }
}

function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
      throw new AssertionError(msg);
    }
}

let Dbg = vscode.window.createOutputChannel("List navigation");

class DocumentScanner {
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
}

function isAscii(ch: char): boolean {
    return ch.charCodeAt(0) <= 127;
}

function documentBegin(): vscode.Position {
    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    return document.lineAt(0).range.start;
}

function documentEnd(): vscode.Position {
    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    return document.lineAt(document.lineCount - 1).range.end;
}

function documentCharacter(pos: vscode.Position): string {
    const editor = vscode.window.activeTextEditor!!;
    console.log(editor);
    const document = editor.document!!;
    console.log(document);

    // Dbg.appendLine(`Found "${document.lineAt(pos.line).text[pos.character]}"`);
    
    // If there is no character here then that means cursor is on a newline.
    return document.lineAt(pos.line).text[pos.character] || "\n";
}

/*++
https://github.com/Microsoft/vscode/issues/44235
--*/
function previousPosition(pos: vscode.Position): vscode.Position {
    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;

    assert(pos.isAfter(documentBegin()));

    if (pos.character === 0)
        return document.lineAt(pos.line - 1).range.end;
    else
        return pos.translate({ characterDelta: -1 });
}

function nextPosition(pos: vscode.Position): vscode.Position {
    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;

    assert(pos.isBefore(documentEnd()));
    
    if (pos.character === document.lineAt(pos.line).range.end.character)
        return document.lineAt(pos.line + 1).range.start;
    else
        return pos.translate({ characterDelta: 1 });
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
function scanStringForward(from: vscode.Position, kind: char): vscode.Position {
    Dbg.appendLine(`scanStringForward from: ${from.line + 1}:${from.character + 1} kind: ${kind}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    let pos = from.with();
    const stop = documentEnd();
    
    while (pos.isBefore(stop)) {
        const ch = documentCharacter(pos);
        pos = nextPosition(pos);
        
        const code = syntax(document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.String:
                if (kind == ch) {
                    return pos;
                }
                break;
            case SyntaxCode.Escape:
                if (pos.isEqual(stop)) {
                    throw new Error("Unbalanced string missing closing quote.");
                }
                // Ignore the next character.
                pos = nextPosition(pos);
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
function scanStringBackward(from: vscode.Position, kind: char): vscode.Position {
    Dbg.appendLine(`scanStringBackward from: ${from.line + 1}:${from.character + 1} kind: ${kind}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    let pos = from.with();
    const stop = documentBegin();
    
    while (pos.isAfter(stop)) {
        const ch = documentCharacter(pos);
        pos = previousPosition(pos);
        
        const code = syntax(document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.String:
                // Make sure ch is not quoted.
                if (kind == ch && 
                    (pos.character == 0 || syntax(document.languageId, documentCharacter(pos)) != SyntaxCode.Escape)) {
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
function scanForwardUntil(from: vscode.Position, stopChar: char, stopChar1?: char): vscode.Position {
    Dbg.appendLine(`scanForwardUntil from: ${from.line + 1}:${from.character + 1} stopChar: ${stopChar} stopChar1: ${stopChar1 || "none"}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    let pos = from.with();
    const stop = documentEnd();
    
    while (pos.isBefore(stop)) {
        const ch = documentCharacter(pos);
        pos = nextPosition(pos);
        
        const code = syntax(document.languageId, ch);
        
        switch (code) {
            case SyntaxCode.Escape:
                if (pos.isEqual(stop)) {
                    throw new Error("Unexpected end of file in scanForwardUntil.");
                }
                // Ignore the next character.
                pos = nextPosition(pos);
                break;
            default:
                if (ch == stopChar && (!stopChar1 || documentCharacter(pos) == stopChar1)) {
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
function scanBackwardUntil(from: vscode.Position, stopChar: char, stopChar1?: char): vscode.Position {
    Dbg.appendLine(`scanBackwardUntil from: ${from.line + 1}:${from.character + 1} stopChar: ${stopChar} stopChar1: ${stopChar1 || "none"}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    const stop = documentBegin();
    
    const searchChars = stopChar + (stopChar1 || '');
    const searchCount = searchChars.length;

    let pos = from.with();
    let searchIndex = 0;

    while (searchIndex < searchCount) {
        while (pos.isAfter(stop)) {
            const ch = documentCharacter(pos);
            pos = previousPosition(pos);
            
            const code = syntax(document.languageId, ch);
            // Make sure ch is not quoted.
            if (ch == searchChars[searchIndex] && (pos.character == 0 || syntax(document.languageId, documentCharacter(pos)) != SyntaxCode.Escape)) {
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
function scanLists(from: vscode.Position, count: number, depth: number): vscode.Position {
    Dbg.appendLine(`scanLists from: ${from.line + 1}:${from.character + 1} count: ${count} depth: ${depth}`);

    const editor = vscode.window.activeTextEditor!!;
    const document = editor.document!!;
    const stop = count > 0 ? document.lineAt(document.lineCount - 1).range.end : document.lineAt(0).range.start;

    // Fail if depth gets below minDepth.
    const minDepth = depth > 0 ? 0 : depth;

    let pos = from.with();

    while (count > 0) {
        countOnce:
        while (!pos.isEqual(stop)) {
            const ch = documentCharacter(pos);
            pos = nextPosition(pos);
            
            const code = syntax(
                document.languageId,
                ch,
                !pos.isEqual(stop) ? documentCharacter(pos) : undefined);
            
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
                    pos = scanStringForward(pos, ch);
                    break;
                case SyntaxCode.Escape:
                    // There shouldn't be random escape characters
                    // in code, only parse this in case we started scanning
                    // in the middle of a string. In which case we do our best.
                    if (pos.isEqual(stop)) {
                        throw new Error("scanLists unexpected escape character.");
                    }
                    // Ignore the next character.
                    pos = nextPosition(pos);
                    break;
                case SyntaxCode.SingleLineComment:
                    // syntax() should have verified that the next character is also a /.
                    pos = nextPosition(pos);
                    // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
                    pos = scanForwardUntil(pos, "\n");
                    break;
                case SyntaxCode.MultiLineCommentStart:
                    pos = scanForwardUntil(pos, "*", "/");
                    break;
                case SyntaxCode.MultiLineCommentEnd:
                    break;
            }

            if (depth < minDepth) {
                throw new Error(`Depth fell below minimum at ${pos.line + 1}:${pos.character + 1}`);
            }
        }
        if (pos.isEqual(stop) && depth != 0) {
            throw new Error("Unexpected end of file in scanLists.");
        }
        --count;
    }

    while (count < 0) {
        countOnce:
        while (!pos.isEqual(stop)) {
            pos = previousPosition(pos);
            const ch = documentCharacter(pos);
            
            const code = syntax(
                document.languageId,
                ch,
                !pos.isEqual(stop) ? documentCharacter(pos) : undefined);
            
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
                    pos = scanStringBackward(pos, ch);
                    break;
                case SyntaxCode.SingleLineComment:
                    // syntax() should have verified that the next character is also a /.
                    //pos = previousPosition(pos);
                    // But we scanForwardUntil would also skip past it if we didn't do nextPosition here.
                    //pos = scanForwardUntil(pos, "\n");
                    break;
                case SyntaxCode.MultiLineCommentStart:
                    break;
                case SyntaxCode.MultiLineCommentEnd:
                    pos = scanBackwardUntil(pos, "*", "/");
                    break;
            }
        }
        if (pos.isEqual(stop) && depth != 0) {
            throw new Error("Unexpected beginning of file in scanLists.");
        }
        
        if (depth < minDepth) {
            throw new Error(`Depth fell below minimum at ${pos.line + 1}:${pos.character + 1}`);
        }
        ++count;
    }

    return pos;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

function cursorMove(target: vscode.Position) {
    /*
    I think this is the right way

    https://code.visualstudio.com/api/references/vscode-api
    let cmd = vscode.commands.registerTextEditorCommand('extension.mysnippet', (te) => {
    // selection start = line 3, char 5 ||| selection end = line 3, char 5
    te.selection = new vscode.Selection(5, 3, 5, 3)
    });
    context.subscriptions.push(cmd);
    */


    let editor: Writeable<vscode.TextEditor> = vscode.window.activeTextEditor!!;
    const newSe = new vscode.Selection(target.line, target.character, target.line, target.character);
    editor.selection = newSe;
    editor.revealRange(newSe, vscode.TextEditorRevealType.Default);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "list-navigation" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('list-navigation.helloWorld', async () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World from list-navigation!');

        let ext = vscode.extensions.getExtension("ms-vscode.cpptools");
        let activated = await ext?.activate ();

        const result: Array<vscode.SymbolInformation> = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', vscode.window.activeTextEditor?.document.uri);
        Dbg.appendLine(`${result[0].name}`);
        // we can get functions, kind == 11

        // provideDocumentRangeSemanticTokens  same as provideDocumentSemanticTokens but we can limit to a range we pass as arg
        const result2: vscode.SemanticTokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', vscode.window.activeTextEditor?.document.uri);
        Dbg.appendLine(`${result2}`);
        // it's groups of 5 integers in a huge array result2.data
        // you have to decode it using provideDocumentRangeSemanticTokensLegend 

        const result3: vscode.SemanticTokensLegend = await vscode.commands.executeCommand('vscode.provideDocumentRangeSemanticTokensLegend', vscode.window.activeTextEditor?.document.uri);
        Dbg.appendLine(`${result3}`);
        // this returns undefined though.. https://github.com/microsoft/vscode/blob/6136c815bc6e7b99ec2dac56dccb3869574d2dd8/src/vs/workbench/api/common/extHostApiCommands.ts
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.forward-list', () => {
        const editor = vscode.window.activeTextEditor!!;
        const document = editor.document!!;
        const cursorPos = editor.selection.active!!;
        try {
            const target = scanLists(cursorPos, 1, 0);
            cursorMove(target);
        } catch (e: any) {

            Dbg.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.backward-list', () => {
        const editor = vscode.window.activeTextEditor!!;
        const document = editor.document!!;
        const cursorPos = editor.selection.active!!;
        try {
            const target = scanLists(cursorPos, -1, 0);
            cursorMove(target);
        } catch (e: any) {
            Dbg.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.backward-up-list', () => {
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.down-list', () => {
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.expand-select-list', () => {
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {}
