import { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { MACOS, LINUX, CONTAINER, SETTINGS_CONTAINER, DEFAULT_SETTINGS } from '../constants';

// Webpack imports
import '../../build/Release/black-magic.node';
import LofiSettings from '../models/lofiSettings';
import '../../icon.png';
import '../../icon.ico';
import { version } from '../../version.generated';

// Visualizations look snappier on 60Hz refresh rate screens if we disable vsync
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendArgument('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-transparent-visuals');

// Settings bootstrap
Store.initRenderer();
const store = new Store();
const useGpu = store.get('settings.hardware_acceleration') ?? DEFAULT_SETTINGS.hardware_acceleration;

// FIXME Patch to always disable hardware acceleration on LINUX, cf. https://github.com/dvx/lofi/issues/149
if (!useGpu || LINUX) {
  app.disableHardwareAcceleration();
}

let mainWindow: Electron.BrowserWindow | null = null;
let mousePoller: NodeJS.Timeout;
let initialBounds: Electron.Rectangle;

// Only allow a single instance
let isSingleInstance: boolean = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
}

const windowConfig: any = {};

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    x: windowConfig.x,
    y: windowConfig.y,
    height: CONTAINER.VERTICAL,
    width: CONTAINER.HORIZONTAL,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    transparent: true,
    hasShadow: false,
    skipTaskbar: !windowConfig.show_in_taskbar,
    webPreferences: {
      allowRunningInsecureContent: false,
      nodeIntegration: true,
      contextIsolation: false,
      nativeWindowOpen: true,
    },
    backgroundColor: '#00000000',
  });

  // Workaround to make setSkipTaskbar behave
  // cf. https://github.com/electron/electron/issues/18378
  mainWindow.on('focus', () => {
    mainWindow.setSkipTaskbar(!windowConfig.show_in_taskbar);
  });

  mainWindow.setAlwaysOnTop(windowConfig.always_on_top, 'floating', 1);
  mainWindow.setFocusable(windowConfig.show_in_taskbar);
  mainWindow.setVisibleOnAllWorkspaces(true);

  // And load the index.html of the app
  mainWindow.loadURL(path.join(__dirname, './index.html'));

  // Every 10 milliseconds, poll to see if we should ignore mouse events or not
  mousePoller = setInterval(() => {
    try {
      let p = screen.getCursorScreenPoint();
      let b = mainWindow.getBounds();
      // Bounding box for the area that's "clickable" -- e.g. main player square
      let bb = {
        ix: b.x + (CONTAINER.HORIZONTAL - windowConfig.side) / 2,
        iy: b.y + (CONTAINER.VERTICAL - windowConfig.side) / 2,
        ax: b.x + (windowConfig.side + (CONTAINER.HORIZONTAL - windowConfig.side) / 2),
        ay: b.y + (windowConfig.side + (CONTAINER.VERTICAL - windowConfig.side) / 2),
      };

      if (bb.ix <= p.x && p.x <= bb.ax && bb.iy <= p.y && p.y <= bb.ay) {
        mainWindow.setIgnoreMouseEvents(false);
      } else {
        mainWindow.setIgnoreMouseEvents(true);
      }
    } catch (e) {
      // FIXME: Sometimes the visualization window gets destroyed before the main window
      //        This causes an error to briefly pop up, so suppress it here. How should this be fixed?
      //        Only happens when using OS-y ways of closing windows (e.g. OSX "File->Quit" menu)
    }
  }, 10);

  if (store.get('settings.debug') === true) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  ipcMain.on('windowMoving', (_: Event, { mouseX, mouseY }: { mouseX: number; mouseY: number }) => {
    const { x, y } = screen.getCursorScreenPoint();

    let bounds: Partial<Electron.Rectangle> = {
      x: x - mouseX,
      y: y - mouseY,
    };

    // Bounds increase even when set to the same value, this is a quirk of the setBounds function
    // We must keep the bounds constant to keep the window where it should be
    // See: https://github.com/dvx/lofi/issues/118
    if (!initialBounds) {
      initialBounds = mainWindow.getBounds();
    } else {
      bounds.width = initialBounds.width;
      bounds.height = initialBounds.height;
    }

    // Use setBounds instead of setPosition
    // See: https://github.com/electron/electron/issues/9477#issuecomment-406833003
    mainWindow.setBounds(bounds);

    const screenBounds = screen.getDisplayMatching(mainWindow.getBounds()).bounds;
    const centerPosX = bounds.x + bounds.width / 2;
    const onLeftSide = centerPosX - screenBounds.x < screenBounds.width / 2;
    mainWindow.webContents.send('window-moved', onLeftSide);
  });

  ipcMain.on('windowMoved', (_: Event, { mouseX, mouseY }: { mouseX: number; mouseY: number }) => {
    const { x, y } = screen.getCursorScreenPoint();
    windowConfig.x = x - mouseX;
    windowConfig.y = y - mouseY;
  });

  ipcMain.on('windowResizing', (_: Event, length: number) => {
    windowConfig.side = length;
  });

  ipcMain.on('close', (_: Event) => {
    mainWindow.close();
  });

  mainWindow.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
    switch (details.frameName) {
      case 'settings': {
        createSettingsWindow();
        break;
      }
      case 'about': {
        createAboutWindow();
        break;
      }
      default: {
        shell.openExternal(details.url);
      }
    }

    return { action: 'deny' };
  });
}

function createSettingsWindow() {
  const settingsWindow = new BrowserWindow({
    x:
      screen.getDisplayMatching(mainWindow.getBounds()).bounds.x -
      SETTINGS_CONTAINER.HORIZONTAL / 2 +
      screen.getDisplayMatching(mainWindow.getBounds()).bounds.width / 2,
    y:
      screen.getDisplayMatching(mainWindow.getBounds()).bounds.y -
      SETTINGS_CONTAINER.VERTICAL / 2 +
      screen.getDisplayMatching(mainWindow.getBounds()).bounds.height / 2,
    height: SETTINGS_CONTAINER.VERTICAL,
    width: SETTINGS_CONTAINER.HORIZONTAL,
    modal: false,
    parent: mainWindow,
    frame: false,
    resizable: true,
    maximizable: false,
    focusable: true,
    title: 'Lofi Settings',
    webPreferences: {
      nativeWindowOpen: true,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.setResizable(true);
  if (store.get('settings.debug') === true) {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createAboutWindow() {
  const mainWindowBounds = mainWindow.getBounds();
  const aboutWindow = new BrowserWindow({
    x:
      screen.getDisplayMatching(mainWindowBounds).bounds.x -
      400 / 2 +
      screen.getDisplayMatching(mainWindowBounds).bounds.width / 2,
    y:
      screen.getDisplayMatching(mainWindowBounds).bounds.y -
      400 / 2 +
      screen.getDisplayMatching(mainWindowBounds).bounds.height / 2,
    height: 400,
    width: 400,
    modal: false,
    parent: mainWindow,
    frame: false,
    resizable: false,
    maximizable: false,
    focusable: true,
    title: 'About Lofi',
  });

  aboutWindow.setMenu(null);
  aboutWindow.setResizable(true);
  if (store.get('settings.debug') === true) {
    aboutWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Needs to be global, see: https://www.electronjs.org/docs/faq#my-apps-windowtray-disappeared-after-a-few-minutes
let tray = null;

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  const settingsVersion = store.get('settings.version');

  if (settingsVersion === null || settingsVersion !== String(version)) {
    // TODO load default settings
    // settings.resetToDefaultsSync();
    // Default position is based on OS; (0,0) sometimes breaks
    // settings.setSync('lofi.window.x', 0 - CONTAINER.HORIZONTAL / 2 + screen.getPrimaryDisplay().size.width / 2);
    // settings.setSync('lofi.window.y', 0 - CONTAINER.VERTICAL / 2 + screen.getPrimaryDisplay().size.height / 2);
  }

  // version mismatch, nuke the settings
  Object.assign(windowConfig, {
    x: Number(store.get('settings.lofi.window.x')),
    y: Number(store.get('settings.lofi.window.y')),
    always_on_top: Boolean(store.get('settings.lofi.window.always_on_top')),
    show_in_taskbar: Boolean(store.get('settings.lofi.window.show_in_taskbar')),
    side: Number(store.get('settings.lofi.window.side')),
  });

  if (LINUX) {
    // Linux transparency fix, delay launch by 1s
    setTimeout(createWindow, 1000);
  } else {
    createWindow();
  }

  tray = new Tray(nativeImage.createFromPath(__dirname + '/icon.png').resize({ height: 16 }));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `lofi v${version}`,
      enabled: false,
      icon: nativeImage.createFromPath(__dirname + '/icon.png').resize({ height: 16 }),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      type: 'normal',
      click: () => {
        mainWindow.webContents.send('show-settings');
      },
    },
    {
      label: 'About',
      type: 'normal',
      click: () => {
        mainWindow.webContents.send('show-about');
      },
    },
    {
      label: 'Exit',
      type: 'normal',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`lofi v${version}`);

  mainWindow.once('ready-to-show', () => {
    const bounds = mainWindow.getBounds();
    const screenBounds = screen.getDisplayMatching(bounds).bounds;
    mainWindow.webContents.send('window-ready', bounds, screenBounds);
  });
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  clearTimeout(mousePoller);
  app.quit();
});

app.on('will-quit', () => {
  const settings = store.get('settings') as LofiSettings;
  settings.lofi.window.x = windowConfig.x;
  settings.lofi.window.y = windowConfig.y;
  settings.lofi.window.side = windowConfig.side;

  store.set('settings', settings);
});

app.on('activate', () => {
  // On OS X it"s common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (MACOS && mainWindow === null) {
    createWindow();
  }
});
