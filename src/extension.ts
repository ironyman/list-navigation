import * as vscode from 'vscode';
import { cursorMove, cursorMoveWithContext, cursorSelect, cursorSelectWithContext } from './cursor';
import { DocumentScanner } from './document-scanner';
import { scanLists } from './syntax';
import { DbgChannel } from './debug';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "list-navigation" is now active!');

    if (process.env.VSCODE_DEBUG_MODE === "true") {
        DbgChannel.show();
    }

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
        DbgChannel.appendLine(`${result[0].name}`);
        // we can get functions, kind == 11

        // provideDocumentRangeSemanticTokens  same as provideDocumentSemanticTokens but we can limit to a range we pass as arg
        const result2: vscode.SemanticTokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', vscode.window.activeTextEditor?.document.uri);
        DbgChannel.appendLine(`${result2}`);
        // it's groups of 5 integers in a huge array result2.data
        // you have to decode it using provideDocumentRangeSemanticTokensLegend 

        const result3: vscode.SemanticTokensLegend = await vscode.commands.executeCommand('vscode.provideDocumentRangeSemanticTokensLegend', vscode.window.activeTextEditor?.document.uri);
        DbgChannel.appendLine(`${result3}`);
        // this returns undefined though.. https://github.com/microsoft/vscode/blob/6136c815bc6e7b99ec2dac56dccb3869574d2dd8/src/vs/workbench/api/common/extHostApiCommands.ts
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('list-navigation.forward-list', (te) => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const targetOffset = scanLists(doc, doc.documentTextPos, 1, 0);
            const target = doc.editor.document.positionAt(targetOffset);
            te.selection = new vscode.Selection(target.line, target.character, target.line, target.character);
            doc.editor.revealRange(te.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('list-navigation.backward-list', (te) => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const targetOffset = scanLists(doc, doc.documentTextPos, -1, 0);
            const target = doc.editor.document.positionAt(targetOffset);
            te.selection = new vscode.Selection(target.line, target.character, target.line, target.character);
            doc.editor.revealRange(te.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('list-navigation.backward-up-list', (te) => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const targetOffset = scanLists(doc, doc.documentTextPos, -1, 1);
            const target = doc.editor.document.positionAt(targetOffset);
            te.selection = new vscode.Selection(target.line, target.character, target.line, target.character);
            doc.editor.revealRange(te.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('list-navigation.down-list', (te) => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const targetOffset = scanLists(doc, doc.documentTextPos, 1, -1);
            const target = doc.editor.document.positionAt(targetOffset);
            te.selection = new vscode.Selection(target.line, target.character, target.line, target.character);
            doc.editor.revealRange(te.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('list-navigation.expand-select-list', (te) => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const activeOffset = scanLists(doc, doc.documentTextPos, -1, 1);
            const anchorOffset = scanLists(doc, activeOffset, 1, 0);
            const anchor = doc.editor.document.positionAt(anchorOffset);
            const active = doc.editor.document.positionAt(activeOffset);
            te.selection = new vscode.Selection(anchor.line, anchor.character, active.line, active.character);
            doc.editor.revealRange(te.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);    
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {}
