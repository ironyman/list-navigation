import * as vscode from 'vscode';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export function cursorMove(editor: vscode.TextEditor, targetOffset: number) {
    /*
    I think this is the right way

    https://code.visualstudio.com/api/references/vscode-api
    let cmd = vscode.commands.registerTextEditorCommand('extension.mysnippet', (te) => {
    // selection start = line 3, char 5 ||| selection end = line 3, char 5
    te.selection = new vscode.Selection(5, 3, 5, 3)
    });
    context.subscriptions.push(cmd);
    */

    let editorW: Writeable<vscode.TextEditor> = editor;
    const target = editorW.document.positionAt(targetOffset);
    const sel = new vscode.Selection(target.line, target.character, target.line, target.character);
    editorW.selection = sel;
    editorW.revealRange(sel, vscode.TextEditorRevealType.Default);
}

export function cursorSelect(editor: vscode.TextEditor, anchorOffset: number, activeOffset: number) {
    let editorW: Writeable<vscode.TextEditor> = editor;
    const anchor = editorW.document.positionAt(anchorOffset);
    const active = editorW.document.positionAt(activeOffset);
    const sel = new vscode.Selection(anchor.line, anchor.character, active.line, active.character);
    editorW.selection = sel;
    editorW.revealRange(sel, vscode.TextEditorRevealType.Default);
}

export function cursorMoveWithContext(context: vscode.ExtensionContext, editor: vscode.TextEditor, targetOffset: number) {
    // https://code.visualstudio.com/api/references/vscode-api
    let cmd = vscode.commands.registerTextEditorCommand('extension.mysnippet', (te) => {
        const target = editor.document.positionAt(targetOffset);
        te.selection = new vscode.Selection(target.line, target.character, target.line, target.character);
        editor.revealRange(te.selection, vscode.TextEditorRevealType.Default);
    });
    context.subscriptions.push(cmd);
}

export function cursorSelectWithContext(context: vscode.ExtensionContext, editor: vscode.TextEditor, anchorOffset: number, activeOffset: number) {
    let cmd = vscode.commands.registerTextEditorCommand('extension.mysnippet', (te) => {
        const anchor = editor.document.positionAt(anchorOffset);
        const active = editor.document.positionAt(activeOffset);
        te.selection = new vscode.Selection(anchor.line, anchor.character, active.line, active.character);
        editor.revealRange(te.selection, vscode.TextEditorRevealType.Default);
    });
    context.subscriptions.push(cmd);
}