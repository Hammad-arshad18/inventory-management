const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('./database/database');

class InventoryApp {
  constructor() {
    this.mainWindow = null;
    this.database = new Database();
    this.setupApp();
  }

  setupApp() {
    app.whenReady().then(() => {
      this.createWindow();
      this.setupMenu();
      this.setupIPC();
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      icon: path.join(__dirname, '../assets/icon.png'),
      show: false
    });

    this.mainWindow.loadFile('src/renderer/index.html');

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  setupMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Item',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow.webContents.send('menu-new-item');
            }
          },
          {
            label: 'Import Data',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openFile'],
                filters: [
                  { name: 'JSON Files', extensions: ['json'] },
                  { name: 'CSV Files', extensions: ['csv'] }
                ]
              });
              
              if (!result.canceled) {
                this.mainWindow.webContents.send('menu-import-data', result.filePaths[0]);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    // Inventory operations
    ipcMain.handle('get-all-items', async () => {
      return await this.database.getAllItems();
    });

    ipcMain.handle('get-item-by-id', async (event, id) => {
      return await this.database.getItemById(id);
    });

    ipcMain.handle('get-item-by-barcode', async (event, barcode) => {
      return await this.database.getItemByBarcode(barcode);
    });

    ipcMain.handle('search-items', async (event, searchTerm) => {
      return await this.database.searchItems(searchTerm);
    });

    ipcMain.handle('add-item', async (event, item) => {
      return await this.database.addItem(item);
    });

    ipcMain.handle('update-item', async (event, id, item) => {
      return await this.database.updateItem(id, item);
    });

    ipcMain.handle('delete-item', async (event, id) => {
      return await this.database.deleteItem(id);
    });

    // Order operations
    ipcMain.handle('create-order', async (event, order) => {
      return await this.database.createOrder(order);
    });

    ipcMain.handle('get-all-orders', async () => {
      return await this.database.getAllOrders();
    });

    ipcMain.handle('get-order-by-id', async (event, id) => {
      return await this.database.getOrderById(id);
    });

    // Low stock alerts
    ipcMain.handle('get-low-stock-items', async (event, threshold = 10) => {
      return await this.database.getLowStockItems(threshold);
    });

    // Database initialization
    ipcMain.handle('init-database', async () => {
      return await this.database.init();
    });

    // Settings operations
    ipcMain.handle('get-setting', async (event, key) => {
      return await this.database.getSetting(key);
    });

    ipcMain.handle('set-setting', async (event, key, value) => {
      return await this.database.setSetting(key, value);
    });

    ipcMain.handle('get-all-settings', async () => {
      return await this.database.getAllSettings();
    });

    ipcMain.handle('initialize-default-settings', async () => {
      return await this.database.initializeDefaultSettings();
    });

    // Stock History operations
    ipcMain.handle('add-stock-history', async (event, itemId, itemName, barcode, type, quantity, previousStock, newStock, reference) => {
      return await this.database.addStockHistory(itemId, itemName, barcode, type, quantity, previousStock, newStock, reference);
    });

    ipcMain.handle('get-stock-history', async (event, filters) => {
      return await this.database.getStockHistory(filters);
    });

    ipcMain.handle('update-item-stock', async (event, itemId, newQuantity) => {
      return await this.database.updateItemStock(itemId, newQuantity);
    });

    // Authentication operations
    ipcMain.handle('authenticate-user', async (event, email, password) => {
      try {
        console.log('Authenticating user:', email);
        const user = await this.database.getUserByEmail(email);
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (user) {
          const crypto = require('crypto');
          console.log('Password hash length:', user.password_hash.length);
          console.log('Password hash starts with:', user.password_hash.substring(0, 10));
          
          // Check if it's the new secure format (salt:hash)
          if (user.password_hash.includes(':')) {
            // New secure format
            const [salt, hash] = user.password_hash.split(':');
            const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
            const isValid = hash === testHash;
            console.log('Secure format comparison result:', isValid);
            return isValid ? user : null;
          } else {
            // Legacy format - try SHA-256 for backward compatibility
            console.log('Using legacy format authentication');
            const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
            const isValid = user.password_hash === legacyHash;
            console.log('Legacy format comparison result:', isValid);
            
            if (isValid) {
              // Migrate to secure format
              console.log('Migrating user to secure password format');
              const salt = crypto.randomBytes(32).toString('hex');
              const newHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
              const newPasswordHash = salt + ':' + newHash;
              await this.database.updateUserPassword(email, newPasswordHash);
              console.log('Password migrated to secure format');
            }
            
            return isValid ? user : null;
          }
        }
        return null;
      } catch (error) {
        console.error('Authentication error:', error);
        return null;
      }
    });

    ipcMain.handle('update-user-password', async (event, email, currentPassword, newPassword) => {
      try {
        const crypto = require('crypto');
        
        // Get user to verify current password
        const user = await this.database.getUserByEmail(email);
        if (!user) {
          return false;
        }
        
        // Verify current password
        let isCurrentPasswordValid = false;
        
        if (user.password_hash.includes(':')) {
          // New secure format
          const [salt, hash] = user.password_hash.split(':');
          const testHash = crypto.pbkdf2Sync(currentPassword, salt, 100000, 64, 'sha512').toString('hex');
          isCurrentPasswordValid = hash === testHash;
        } else {
          // Legacy format
          const legacyHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
          isCurrentPasswordValid = user.password_hash === legacyHash;
        }
        
        if (!isCurrentPasswordValid) {
          return false;
        }
        
        // Hash new password with secure format
        const newSalt = crypto.randomBytes(32).toString('hex');
        const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 100000, 64, 'sha512').toString('hex');
        const newPasswordHash = newSalt + ':' + newHash;
        
        // Update password
        await this.database.updateUserPassword(email, newPasswordHash);
        return true;
      } catch (error) {
        console.error('Error updating password:', error);
        return false;
      }
    });

    ipcMain.handle('initialize-default-user', async () => {
      return await this.database.initializeDefaultUser();
    });
  }
}

// Initialize the application
new InventoryApp();
