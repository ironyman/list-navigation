import * as vscode from 'vscode';
import { DbgChannel } from './debug';

// If I could do parameterized type or concept
// I would make char a string of length 1
// but since I can't I'll just put that here in comments.
export type char = string

export class DocumentScanner {
    // The purpose of this class is to abstract/cache things from
    // vscode.TextEditor because accessing it each time we change position
    // or get character is slow.
    editor: vscode.TextEditor;
    documentText: string;
    documentTextPos: number;

    // For printing debug things.
    scanDepth: number;

    constructor(editor: vscode.TextEditor) {
        this.editor = editor;
        this.documentText = editor.document.getText();
        this.documentTextPos = editor.document.offsetAt(editor.selection.active);
        this.scanDepth = 0;
    }

    static fromActiveEditor(): DocumentScanner {
        return new DocumentScanner(vscode.window.activeTextEditor!!);
    }

    fetchChar(pos: number): char {
        return this.documentText[pos];
    }

    documentEnd(): number {
        return this.documentText.length;
    }

    documentBegin(): number {
        return 0;
    }

    // For debugging.
    getCaller(): string {
        const stack = new Error().stack!!.split("\n");
        return stack[3].trim().split(" ")[1];
    }

    reportScanningStart(from: number, msg: string) {
        DbgChannel.appendLine(` `.repeat(this.scanDepth) + `${this.getCaller()} start from ${this.offsetToLineColumn(from)} - ${msg}`);
        ++this.scanDepth;
    }
    reportScanningStop(from: number, msg: string) {
        --this.scanDepth;
        DbgChannel.appendLine(` `.repeat(this.scanDepth) + `${this.getCaller()} stop from ${this.offsetToLineColumn(from)} - ${msg}`);
    }

    offsetToLineColumn(offset: number): string {
        const pos = this.editor.document.positionAt(offset);
        return `${pos.line + 1}:${pos.character + 1}`;
    }
}