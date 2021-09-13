import * as React from 'react';
import { ipcRenderer, Rectangle } from 'electron';
import Store from 'electron-store';
import {
  getAuthUrl,
  refreshAccessToken,
  AuthData,
  setTokenRetrievedCallback,
} from '../../../main/auth';
import {
  CONTAINER,
  MAX_SIDE_LENGTH,
  MIN_SIDE_LENGTH,
} from '../../../constants';
import Cover from './Cover';
import Settings from './Settings';
import About from './About';
import Welcome from './Welcome';
import WindowPortal from '../util/WindowPortal';

import './style.scss';
import { SpotifyApiInstance } from '../../../api/spotify-api';
import LofiSettings from '../../../models/lofiSettings';

enum SIDE {
  LEFT,
  RIGHT,
}

class Lofi extends React.Component<any, any> {
  private store: Store;
  private bounds: Rectangle;
  private screenBounds: Rectangle;

  constructor(props: any) {
    super(props);

    this.store = new Store();
    this.loadSettings();

    // Allow to open settings via IPC channel (e.g. triggered by a taskbar click)
    ipcRenderer.on('show-settings', () => {
      this.showSettingsWindow();
    });

    // Allow to open settings via IPC channel (e.g. triggered by a taskbar click)
    ipcRenderer.on('show-about', () => {
      this.showAboutWindow();
    });

    ipcRenderer.on('window-moved', (_: Event, onLeftSide: boolean) => {
      this.setState({ window_side: onLeftSide ? SIDE.LEFT : SIDE.RIGHT });
    });

    ipcRenderer.on(
      'window-ready',
      async (
        _: Electron.IpcRendererEvent,
        bounds: Rectangle,
        screenBounds: Rectangle
      ) => {
        this.bounds = bounds;
        this.screenBounds = screenBounds;
        this.setScreenSide();
        await this.setupWindow();
        this.forceUpdate();
      }
    );
  }

  loadSettings() {
    const settings = this.store.get('settings') as LofiSettings;
    this.state = {
      access_token: settings.access_token,
      refresh_token: settings.refresh_token,
      showSettings: false,
      showAbout: false,
      lofi: settings.lofi,
      side_length: settings.lofi.window.side,
      auth_url: '',
    };
  }

  // Determine if the window is in the leftmost or rightmost part of the screen
  setScreenSide() {
    const appCenterX = this.bounds.x + this.bounds.width / 2;

    const side =
      appCenterX - this.screenBounds.x < this.screenBounds.width / 2
        ? SIDE.LEFT
        : SIDE.RIGHT;

    this.setState({ window_side: side });
  }

  reloadSettings() {
    // FIXME Called when we modify/reset the settings
    // this.setState({ lofiSettings: settings.getSync('lofi') });
  }

  async handleAuth() {
    try {
      setTokenRetrievedCallback(this.updateTokens.bind(this));

      // always get the auth url in case refreshing the token fails
      const authUrl = await getAuthUrl();
      this.setState({ auth_url: authUrl });

      if (this.state.refresh_token) {
        await refreshAccessToken(this.state.refresh_token);
      }
    } catch (err) {
      console.error(err);
      this.updateTokens({ access_token: null, refresh_token: null });
    }
  }

  updateTokens(data: AuthData) {
    if (!data || !data.access_token || !data.refresh_token) {
      this.store.delete('settings.access_token');
      this.store.delete('settings.refresh_token');
    } else {
      const settings = this.store.get('settings') as LofiSettings;
      settings.access_token = data.access_token;
      settings.refresh_token = data.refresh_token;
      this.store.set('settings', settings);
    }

    SpotifyApiInstance.updateTokens(data);

    this.setState({ access_token: data?.access_token });
    this.setState({ refresh_token: data?.refresh_token });
  }

  async setupWindow() {
    await this.handleAuth();

    // Move the window when dragging specific element without cannibalizing events
    // Credit goes out to @danielravina
    // See: https://github.com/electron/electron/issues/1354#issuecomment-404348957

    const that = this;
    let animationId: number;
    let mouseX: number;
    let mouseY: number;
    let mouseDeltaX: number;
    let mouseDeltaY: number;

    function onMouseMove(e: any) {
      mouseDeltaX = e.clientX;
      mouseDeltaY = e.clientY;
    }

    function onMouseDown(e: any) {
      if (
        leftMousePressed(e) &&
        !e.target['classList'].contains('not-draggable')
      ) {
        // Cancel old animation frame, fixes mouse getting "stuck" in the drag state
        cancelAnimationFrame(animationId);
        mouseX = e.clientX;
        mouseY = e.clientY;
        document.addEventListener('mouseup', onMouseUp);
        if (e.target['classList'].contains('grab-resize')) {
          requestAnimationFrame(
            resizeWindow.bind(
              that,
              e.target['classList'].contains('top'),
              e.target['classList'].contains('right')
            )
          );
          document.body.classList.remove('click-through');
        } else {
          requestAnimationFrame(moveWindow);
        }
      }
    }

    function onMouseUp(e: MouseEvent) {
      if (leftMousePressed(e)) {
        ipcRenderer.send('windowMoved', { mouseX, mouseY });
        document.removeEventListener('mouseup', onMouseUp);
        cancelAnimationFrame(animationId);
        document.body.classList.add('click-through');
      }
    }

    let resizeWindow = function (top: boolean, right: boolean) {
      let length = that.state.side_length;

      // TODO: The math here can be simplified, but leaving it explicit for now
      if (top && right) {
        const handleX = CONTAINER.HORIZONTAL / 2 + that.state.side_length / 2;
        const handleY = CONTAINER.VERTICAL / 2 - that.state.side_length / 2;
        const dX = handleX + mouseDeltaX;
        const dY = handleY - mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (top && !right) {
        const handleX = CONTAINER.HORIZONTAL / 2 - that.state.side_length / 2;
        const handleY = CONTAINER.VERTICAL / 2 - that.state.side_length / 2;
        const dX = handleX - mouseDeltaX;
        const dY = handleY - mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (!top && right) {
        const handleX = CONTAINER.HORIZONTAL / 2 + that.state.side_length / 2;
        const handleY = CONTAINER.VERTICAL / 2 + that.state.side_length / 2;
        const dX = mouseDeltaX - handleX;
        const dY = mouseDeltaY - handleY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (!top && !right) {
        const handleX = CONTAINER.HORIZONTAL / 2 - that.state.side_length / 2;
        const handleY = CONTAINER.VERTICAL / 2 + that.state.side_length / 2;
        const dX = handleX - mouseDeltaX;
        const dY = handleY + mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      }

      // Maximum side length constraints
      if (length <= MAX_SIDE_LENGTH && length >= MIN_SIDE_LENGTH) {
        ipcRenderer.send('windowResizing', length);
        that.setState({ side_length: length });
      }

      animationId = requestAnimationFrame(resizeWindow.bind(that, top, right));
    };

    let moveWindow = function () {
      ipcRenderer.send('windowMoving', { mouseX, mouseY });
      animationId = requestAnimationFrame(moveWindow);
    }.bind(that);

    function leftMousePressed(e: MouseEvent) {
      var button = e.which || e.button;
      return button === 1;
    }

    document
      .getElementById('visible-ui')
      .addEventListener('mousedown', onMouseDown);
    document
      .getElementById('app-body')
      .addEventListener('mousemove', onMouseMove);
  }

  showAboutWindow() {
    if (!this.state.showAbout) {
      this.setState({ showAbout: true });
    }
  }

  hideAboutWindow() {
    this.setState({ showAbout: false });
  }

  showSettingsWindow() {
    if (!this.state.showSettings) {
      this.setState({ showSettings: true });
    }
  }

  hideSettingsWindow() {
    this.setState({ showSettings: false });
  }

  render() {
    return (
      <div
        id="visible-ui"
        className="click-on"
        style={{
          height: this.state.side_length,
          width: this.state.side_length,
          left: `calc(50% - ${this.state.side_length / 2}px)`,
        }}>
        <div className="top left grab-resize"></div>
        <div className="top right grab-resize"></div>
        <div className="bottom left grab-resize"></div>
        <div className="bottom right grab-resize"></div>
        {this.state.showSettings ? (
          <WindowPortal
            onUnload={this.hideSettingsWindow.bind(this)}
            name="settings">
            <Settings lofi={this} className="settings-wnd" />
          </WindowPortal>
        ) : null}
        {this.state.showAbout ? (
          <WindowPortal onUnload={this.hideAboutWindow.bind(this)} name="about">
            <About lofi={this} className="about-wnd" />
          </WindowPortal>
        ) : null}
        {this.state.access_token ? (
          <Cover
            volume_increment={this.state.lofi.audio.volume_increment}
            metadata={this.state.lofi.window.metadata}
            side={this.state.window_side}
            side_length={this.state.side_length}
            lofi={this}
          />
        ) : (
          <Welcome lofi={this} />
        )}
      </div>
    );
  }
}

export default Lofi;
