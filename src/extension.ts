import * as vscode from 'vscode';
import { cursorMove, cursorSelect } from './cursor';
import { DocumentScanner } from './document-scanner';
import { DbgChannel } from './debug';

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

    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.forward-list', () => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const target = doc.scanLists(doc.documentTextPos, 1, 0);
            cursorMove(doc.editor, target);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.backward-list', () => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const target = doc.scanLists(doc.documentTextPos, -1, 0);
            cursorMove(doc.editor, target);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.backward-up-list', () => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const target = doc.scanLists(doc.documentTextPos, -1, 1);
            cursorMove(doc.editor, target);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.down-list', () => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const target = doc.scanLists(doc.documentTextPos, 1, -1);
            cursorMove(doc.editor, target);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('list-navigation.expand-select-list', () => {
        let doc = DocumentScanner.fromActiveEditor();
        try {
            const active = doc.scanLists(doc.documentTextPos, -1, 1);
            const anchor = doc.scanLists(active, 1, 0);
            cursorSelect(doc.editor, anchor, active);
        } catch (e: any) {
            DbgChannel.appendLine(e.message);
        }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {}
