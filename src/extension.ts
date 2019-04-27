/**
 * The module 'vscode' contains the VS Code extensibility API.
 */
import * as vscode from 'vscode';
import MusicPerMinute from './Mpm';

let enabled = false;
let Mpm: MusicPerMinute;

/**
 * This method is called when the extension is activated.
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {
  Mpm = new MusicPerMinute(context);

  vscode.workspace.onDidChangeConfiguration(Mpm.onDidChangeConfiguration);
  Mpm.onDidChangeConfiguration();

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.mpm', () => {
      vscode.window.showInformationMessage('Music Per Minute Started!');
      if (!enabled) {
        Mpm.init();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.mpm.stop', () => {
      vscode.window.showInformationMessage('Stopped Music Per Minute!');
      deactivate();
    })
  );

  context.subscriptions.push(Mpm);
}

/**
 * Method called when stopping the extension.
 */
export function deactivate() {
  Mpm.dispose();
  vscode.workspace.getConfiguration('mpm').update('enabled', false);
  enabled = false;
}
