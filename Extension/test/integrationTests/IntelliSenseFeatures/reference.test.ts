/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as testHelpers from '../testHelpers';
import * as api from 'vscode-cpptools';
import * as apit from 'vscode-cpptools/out/testApi';

function delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

suite(`[Reference test]`, function(): void {
    let cpptools: apit.CppToolsTestApi;
    let disposables: vscode.Disposable[] = [];
    let path: string = vscode.workspace.workspaceFolders[0].uri.fsPath + "/references.cpp";
    let fileUri: vscode.Uri = vscode.Uri.file(path);
    let testHook: apit.CppToolsTestHook;
    let getIntelliSenseStatus: any;
    let document: vscode.TextDocument;

    suiteSetup(async function(): Promise<void> {
        await testHelpers.activateCppExtension();

        cpptools = await apit.getCppToolsTestApi(api.Version.latest);
        testHook = cpptools.getTestHook();
        getIntelliSenseStatus = new Promise<void>((resolve, reject) => {
            disposables.push(testHook.IntelliSenseStatusChanged(result => {
                result = result as apit.IntelliSenseStatus;
                if (result.filename === "references.cpp" && result.status === apit.Status.IntelliSenseReady) {
                    resolve();
                }
            }));
            setTimeout(() => { reject(new Error("Timeout: IntelliSenseStatusChanged event")); }, testHelpers.defaultTimeout);
        });
        disposables.push(testHook);

        // Start language server
        console.log("Open file: " + fileUri.toString());
        document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
        await getIntelliSenseStatus;
    });

    test("[Find confirmed references of a symbol]", async () => {
        // Get reference of function declaration "int func1()"
        let declarationResult: vscode.Location[] = <vscode.Location[]>(await vscode.commands.executeCommand("vscode.executeReferenceProvider", fileUri, new vscode.Position(17, 7)));
        let functionCallResult: vscode.Location[] = <vscode.Location[]>(await vscode.commands.executeCommand("vscode.executeReferenceProvider", fileUri, new vscode.Position(24, 21)));

        let expectedText: string = "func1";
        assertTextInLocation(document, expectedText, declarationResult);
        assertTextInLocation(document, expectedText, functionCallResult);
        assert.deepEqual(declarationResult, functionCallResult);
    });

    test("[Find references of local param]", async () => {
        // Get reference of local param: var1 in "int func1(float var1)"
        let result: vscode.Location[] = <vscode.Location[]>(await vscode.commands.executeCommand("vscode.executeReferenceProvider", fileUri, new vscode.Position(21, 18)));

        let expectedText: string = "var1";
        assertTextInLocation(document, expectedText, result);
        assert.equal(result.length, 2);
    });

    test("[Add new call to a function and find reference]", async () => {
        // Get reference of "int func1()"declaration
        let beforeEditResult: vscode.Location[] = <vscode.Location[]>(await vscode.commands.executeCommand("vscode.executeReferenceProvider", fileUri, new vscode.Position(17, 7)));
        let expectedText: string = "func1";
        assert.equal(beforeEditResult.length, 3);
        assertTextInLocation(document, expectedText, beforeEditResult);

        // Add another reference to "func1()"
        let workspaceEdit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.insert(fileUri, new vscode.Position(34, 5), "int y = func1();");
        await vscode.workspace.applyEdit(workspaceEdit);
        await getIntelliSenseStatus;

        let afterEditResult: vscode.Location[] = <vscode.Location[]>(await vscode.commands.executeCommand("vscode.executeReferenceProvider", fileUri, new vscode.Position(17, 7)));
        assert.equal(afterEditResult.length, 4);

        assertTextInLocation(document, expectedText, afterEditResult);
    });
});

function assertTextInLocation(document: vscode.TextDocument, expectedText: string, Locations: vscode.Location[], displayLog: boolean = false): void {
    if (displayLog) {
        console.log("expected reference text: " + expectedText);
    }
    Locations.forEach(location => {
        let actualtext: string = document.getText(location.range);
        if (displayLog) {
            console.log("actual reference text: " + actualtext);
        }
        assert.equal(expectedText, actualtext);
    });
}
