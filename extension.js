/**
 * @ts-ignore
 * The module 'vscode' contains the VS Code extensibility API.
 */
const vscode = require('vscode');
const fetch = require('node-fetch');
const EventEmitter = require('events');

class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();

let token = '';
let counter = 0;
let prevCount = 0;

myEmitter.on('keystroke', () => {
  counter++;
});

myEmitter.on('backspace', () => {
  if (counter !== 0) {
    counter = counter - 2;
  }
});

myEmitter.on('check', () => {
  if (counter == 1 && prevCount !== 2) {
    playMusic();
  }
  if (counter == 0 && prevCount !== 0) {
    pauseMusic();
  }
});

const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);

/**
 * This method is called when the extension is activated.
 * The initSpotify method is called after a message is presented.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand('extension.mpm', function() {
    vscode.window.showInformationMessage('Music Per Minute');
  });

  requestSpotifyAccess();
  showTokenPlaceholder();
  setInterval(decrementCounter, 1000);
  vscode.workspace.onDidChangeTextDocument(checkInput);
  context.subscriptions.push(disposable);
}
exports.activate = activate;

/**
 * Opens the Spotify helper to authenticate access
 */
const requestSpotifyAccess = () => {
  vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.parse('https://mpm-template.herokuapp.com/index.html')
  );
};

/**
 * Shows a inputfield where the user enters the Spotify token.
 */
const showTokenPlaceholder = () => {
  vscode.window
    .showInputBox({
      ignoreFocusOut: true,
      prompt: 'Enter your Spotify token here'
    })
    .then(usertoken => {
      token = usertoken;
    });
};

/**
 * Will check if the key pressed is backspace.
 * Call an event emitters to check time and keystroke.
 */
const checkInput = event => {
  if (event.contentChanges[0].text === '') {
    myEmitter.emit('backspace');
  }
  myEmitter.emit('keystroke');
  myEmitter.emit('check');
};

/**
 * This method will decrement the counter by one every second.
 * Call an event emitter to check the time left.
 * Create statusbar with remaining time.
 */
const decrementCounter = () => {
  prevCount = counter;
  if (counter !== 0) {
    counter--;
  }
  myEmitter.emit('check');
  createStatusBarItem();
};

/**
 * Creates the status bar timer and shows time left.
 */
const createStatusBarItem = () => {
  item.text = `${counter.toString()} seconds left`;
  item.show();
};

/**
 * Starts to play music on Spotify
 */
const playMusic = () => {
  const bearer = 'Bearer ' + token;
  fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: bearer,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Pauses music on Spotify
 */
const pauseMusic = () => {
  const bearer = 'Bearer ' + token;
  fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: {
      Authorization: bearer,
      'Content-Type': 'application/json'
    }
  });
};

// this method is called when the extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
};
