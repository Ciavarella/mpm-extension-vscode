import * as cp from 'child_process';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import * as username from 'username';
import * as vscode from 'vscode';

class Emitter extends EventEmitter {}

// tslint:disable-next-line: max-classes-per-file
export default class MusicPerMinute {
  /**
   * Global variables
   */
  private disposable: any;
  private item: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  private _emitter: Emitter;
  private baseUrl = 'https://mpm-node-backend.herokuapp.com';
  private documentChangeListenerDisposer = null;
  private token: string = '';
  private counter: number = 0;
  private prevCount: number = 0;
  private musicTime: number = 0;
  private pauseCount: number = 0;
  private keypressTime: number = 1;
  private userTotalTime: number = 0;
  private enabled: boolean = false;
  private hardMode: boolean = false;
  private sessionId: any = null;
  private intervalId: any = null;
  private isPlaying: boolean = false;
  private decrementTimer: any;
  private sendDataTimer: any;

  private ctx: vscode.ExtensionContext;

  constructor(ctx: vscode.ExtensionContext) {
    this.ctx = ctx;
    this._emitter = new Emitter();

    /*
     * Adds one to the counter.
     */
    this._emitter.on('keystroke', () => {
      this.counter = this.counter + this.keypressTime;
    });

    /*
     * Removes one from the counter if the counter not is on 0.
     */
    this._emitter.on('backspace', () => {
      if (this.hardMode === true) {
        this.counter = 0;
      }
      if (this.counter !== 0) {
        this.counter = this.counter - 1;
      }
    });

    /*
     * Compares the counter and the previous value.
     * Checks if it should play or pause music.
     * Calls the play or pause method.
     */
    this._emitter.on('check', () => {
      if (this.counter === 0 && this.prevCount === 0) {
        return;
      } else if (this.counter > 0 && this.prevCount < this.counter) {
        this.playMusic();
      } else if (this.counter === 0 && this.counter < this.prevCount) {
        this.pauseMusic();
      }
    });
  }

  /*
   * Init method that sets up eventlisteners
   * Starts timer and calls checkApiKey method.
   */
  public init(): void {
    const config = vscode.workspace.getConfiguration('mpm');
    this.keypressTime = config.keypress;
    this.hardMode = config.hardMode;
    this.setupEventListeners();

    this.checkApiKey();
    this.enabled = true;

    this.startTimer();
    this.startDataSend();
  }

  public onDidChangeConfiguration(): void {
    const config = vscode.workspace.getConfiguration('mpm');
    this.enabled = config.get('enabled', false);
  }

  /**
   * Checks if there is a api key saved in config.
   * If not calls the requestSpotifyAccess.
   * Calls the checkValidToken to check if the token is valid.
   */
  public async checkApiKey(): Promise<void> {
    const key = await vscode.workspace.getConfiguration('mpm').get('api_key');

    if (key === undefined) {
      this.requestSpotifyAccess();
      this.showTokenPlaceholder();
    } else {
      this.token = key as any;

      this.checkValidToken();
      this.getUserSettings();
    }
    this.requestNewToken();
  }

  /**
   * Checks if Spotify is open.
   * Checks the OS of the computer and sets a exec command.
   * Exec command starts Spotify.
   */
  public async checkPlaybackDevice(): Promise<void> {
    const bearer = 'Bearer ' + this.token;

    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      method: 'GET',
      headers: {
        Authorization: bearer
      }
    });

    const data = await res.json();

    if (data.devices.length === 0) {
      const os = process.platform;
      let command = '';

      if (os === 'darwin') {
        command = 'open -a spotify';
      } else if (os === 'win32') {
        const windowsUser = this.getWindowsUser();

        command = `start C:\Users\\${windowsUser}\AppData\Roaming\Spotify\Spotify.exe`;
      } else if (os === 'linux') {
        command = 'spotify';
      }
      cp.exec(command, (err, stdout, stderr) => {
        if (err) {
          return;
        }

        this.checkPlaybackDevice();
      });
    } else if (data.devices[0].is_active !== true) {
      const deviceId = data.devices[0].id;

      this.activateSpotify(deviceId);
    } else {
      return;
    }
  }

  /**
   * Gets the username of a Windows user.
   */
  public async getWindowsUser(): Promise<string> {
    return username();
  }

  /**
   * Initiates Spotify
   * This is beacuse when Spotify is started it is not active.
   * This forces me to activate it.
   */
  public activateSpotify(deviceId: string | number): void {
    const bearer = 'Bearer ' + this.token;

    const device = {
      device_ids: [deviceId]
    };

    fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(device)
    });
  }

  /**
   * Checks if the current token still is valid.
   */
  public async checkValidToken(): Promise<void> {
    const bearer = 'Bearer ' + this.token;

    const res = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });

    if (res.status !== 200) {
      this.requestNewToken();
    }

    this.checkPlaybackDevice();
    this.pauseMusic();
  }

  /**
   * Request a new accesstoken with the refreshtoken.
   * Set the new acccesstoken in the config.
   */
  public async requestNewToken(): Promise<void> {
    const refreshKey = vscode.workspace
      .getConfiguration('mpm')
      .get('refresh_key');

    const res = await fetch(
      `${this.baseUrl}/auth/refresh_token?refresh_token=${refreshKey}`,
      {
        method: 'GET'
      }
    );

    const data = await res.json();

    this.token = data.acccess_token;
    const now = Date.now() / 1000;

    vscode.workspace
      .getConfiguration('mpm')
      .update('api_key', data.acccess_token);
    this.ctx.globalState.update('expires', now + 3600);

    this.checkPlaybackDevice();
    this.pauseMusic();
  }

  /**
   * Gets the user and stores the user in config.
   */
  public async getUser(): Promise<void> {
    const bearer = 'Bearer ' + this.token;

    const res = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });

    const user = await res.json();

    this.ctx.globalState.update('user', user);
  }

  /**
   * Opens the Spotify helper to authenticate access
   */
  public requestSpotifyAccess(): void {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse('https://ciavarella.dev/auth/login')
    );
  }

  /**
   * Shows a inputfield where the user enters the Spotify token.
   * Set the acccess_token and refresh_token in the globalstate.
   * Gets the users settings and pauses the music on Spotify if the user is playing.
   */
  public showTokenPlaceholder(): void {
    vscode.window
      .showInputBox({
        ignoreFocusOut: true,
        prompt: 'Enter your Spotify token here'
      })
      .then(async usertoken => {
        const str = usertoken;
        const pos = str!.indexOf('?refresh_token=');

        if (pos === -1) {
          vscode.window.showInformationMessage(
            'Could not use token, please retry'
          );

          this.requestSpotifyAccess();
          this.showTokenPlaceholder();
        } else {
          const refreshToken = str!.slice(pos + 15);
          const accessToken = str!.slice(0, pos);

          this.token = accessToken;
          const now = Date.now() / 1000;

          this.ctx.globalState.update('expires', now + 3600);
          vscode.workspace
            .getConfiguration('mpm')
            .update('api_key', accessToken);
          vscode.workspace
            .getConfiguration('mpm')
            .update('refresh_key', refreshToken);

          this.getUser();
          this.getUserSettings();
          this.checkPlaybackDevice();
          this.pauseMusic();
        }
      });
  }

  /**
   * Sends data to the backend and stores it in the database
   */
  public async sendData(): Promise<void> {
    const user = this.ctx.globalState.get('user');

    const data = {
      sessionId: this.sessionId,
      totalTime: this.userTotalTime,
      musicTime: this.musicTime,
      pausedTimes: this.pauseCount,
      user
    };

    const res = await fetch(`${this.baseUrl}/extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const sessionData = await res.json();
    this.sessionId = sessionData.session[0].id;
  }

  /**
   * Gets the users settings by email.
   * If the user has no settings it will default to the default values.
   */
  public async getUserSettings(): Promise<void> {
    const user: any = this.ctx.globalState.get('user');

    if (user !== undefined) {
      const res = await fetch(`${this.baseUrl}/extension/settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          email: user.email
        }
      });

      const settings = await res.json();

      if (settings.settings !== null) {
        this.keypressTime = settings.settings.keypress;
        this.hardMode = settings.settings.hardcore;
        vscode.workspace
          .getConfiguration('mpm')
          .update('keypress', settings.settings.keypress);
        vscode.workspace
          .getConfiguration('mpm')
          .update('hardMode', settings.settings.hardcore);
      }
    }
  }

  /**
   * This method will decrement the counter by one every second.
   * It will add one second to the users total time using the extension.
   * Call an event emitter to check the time left.
   * Call the create statusbar method.
   */
  public decrementCounter(): void {
    this.userTotalTime++;
    this.prevCount = this.counter;

    if (this.counter !== 0) {
      this.counter--;
    }

    if (this.counter === 0) {
      this._emitter.emit('check');
    }

    this.createStatusBarItem();
  }

  /**
   * Starts the decrement timer with a setInterval
   */
  public startTimer(): void {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window
      },
      () => {
        return new Promise((resolve, reject) => {
          this.decrementTimer = setInterval(() => {
            this.decrementCounter();
          }, 1000);
        });
      }
    );
  }

  public startDataSend(): void {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window
      },
      () => {
        return new Promise((resolve, reject) => {
          this.sendDataTimer = setInterval(() => {
            this.sendData();
          }, 60000);
        });
      }
    );
  }

  /**
   * Starts to play music on Spotify
   * Calls the addMusicTime method to add one every second when music is playing.
   */
  public playMusic(): void {
    if (this.isPlaying === true) {
      return;
    }

    const expires: any = this.ctx.globalState.get('expires');
    const now = Date.now() / 1000;
    if (now > expires) {
      this.requestNewToken();
    }

    this.startInterval();
    const bearer = 'Bearer ' + this.token;
    fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });

    this.isPlaying = true;
  }

  /**
   * Pauses music on Spotify
   * Clears interval on the addMusicTheme method.
   */
  public pauseMusic(): void {
    const expires: any = this.ctx.globalState.get('expires');
    const now = Date.now() / 1000;
    if (now > expires) {
      this.requestNewToken();
    }

    this.stopInterval();
    this.pauseCount++;
    const bearer = 'Bearer ' + this.token;
    fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });
    this.isPlaying = false;
  }

  /**
   * Creates the status bar timer and shows time left.
   */
  public createStatusBarItem(): string {
    this.item.text = `${this.counter.toString()} seconds left`;
    this.item.show();
    return `${this.counter.toString()} seconds left`;
  }

  /**
   * Adds to the played music counter
   */
  public startInterval(): void {
    this.intervalId = setInterval(() => {
      this.musicTime++;
    }, 1000);
  }

  /**
   * Stops the played music counter
   */
  public stopInterval(): void {
    clearInterval(this.intervalId);
  }

  /*
   * Will check if the key pressed is backspace.
   * Call an event emitters to check keystroke.
   */
  public onDidChangeTextDocument(event: any): void {
    if (event.contentChanges[0].text === '') {
      this._emitter.emit('backspace');
    } else {
      this._emitter.emit('keystroke');
    }
    this._emitter.emit('check');
  }

  public dispose() {
    this.disposable.dispose();
    clearInterval(this.intervalId);
    clearInterval(this.decrementTimer);
    clearInterval(this.sendDataTimer);
    this.item.text = '';
    this.item.hide();
    this.counter = 0;
  }

  private setupEventListeners(): void {
    const subscriptions: any = [];
    vscode.workspace.onDidChangeTextDocument(
      this.onDidChangeTextDocument,
      this,
      subscriptions
    );

    this.disposable = vscode.Disposable.from(...subscriptions);
  }
}
