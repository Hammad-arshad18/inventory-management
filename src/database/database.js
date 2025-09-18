const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/inventory.db');
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const fs = require('fs');
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      // Create tables first
      const tableQueries = [
        `CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          barcode TEXT UNIQUE,
          category TEXT,
          price REAL NOT NULL,
          cost REAL,
          quantity INTEGER NOT NULL DEFAULT 0,
          min_stock INTEGER DEFAULT 10,
          supplier TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_number TEXT UNIQUE NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          total_amount REAL NOT NULL,
          tax_amount REAL DEFAULT 0,
          discount_amount REAL DEFAULT 0,
          payment_method TEXT DEFAULT 'cash',
          status TEXT DEFAULT 'completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total_price REAL NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders (id),
          FOREIGN KEY (item_id) REFERENCES items (id)
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS stock_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          barcode TEXT,
          type TEXT NOT NULL CHECK (type IN ('in', 'out')),
          quantity INTEGER NOT NULL,
          previous_stock INTEGER NOT NULL,
          new_stock INTEGER NOT NULL,
          reference TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (item_id) REFERENCES items (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      // Create indexes after tables are created
      const indexQueries = [
        `CREATE INDEX IF NOT EXISTS idx_items_barcode ON items (barcode)`,
        `CREATE INDEX IF NOT EXISTS idx_items_name ON items (name)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id)`,
        `CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_history_item_id ON stock_history (item_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_history_created_at ON stock_history (created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_history_type ON stock_history (type)`
      ];

      this.db.serialize(() => {
        let tableCompleted = 0;
        
        // First create all tables
        tableQueries.forEach((query) => {
          this.db.run(query, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              reject(err);
            } else {
              tableCompleted++;
              if (tableCompleted === tableQueries.length) {
                // Now create indexes
                let indexCompleted = 0;
                indexQueries.forEach((query) => {
                  this.db.run(query, (err) => {
                    if (err) {
                      console.error('Error creating index:', err);
                      // Don't reject for index errors, just log them
                    }
                    indexCompleted++;
                    if (indexCompleted === indexQueries.length) {
                      console.log('All tables and indexes created successfully');
                      this.insertSampleData().then(resolve).catch(reject);
                    }
                  });
                });
              }
            }
          });
        });
      });
    });
  }

  async insertSampleData() {
    return new Promise((resolve) => {
      // Check if we already have data
      this.db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        if (err || row.count > 0) {
          resolve();
          return;
        }

        // Insert sample items
        const sampleItems = [
          {
            id: uuidv4(),
            name: 'Coca Cola 500ml',
            description: 'Refreshing cola drink',
            barcode: '1234567890123',
            category: 'Beverages',
            price: 2.50,
            cost: 1.50,
            quantity: 100,
            min_stock: 20,
            supplier: 'Coca Cola Company'
          },
          {
            id: uuidv4(),
            name: 'Bread Loaf',
            description: 'Fresh white bread',
            barcode: '2345678901234',
            category: 'Bakery',
            price: 3.00,
            cost: 1.80,
            quantity: 50,
            min_stock: 10,
            supplier: 'Local Bakery'
          },
          {
            id: uuidv4(),
            name: 'Milk 1L',
            description: 'Fresh whole milk',
            barcode: '3456789012345',
            category: 'Dairy',
            price: 4.50,
            cost: 3.00,
            quantity: 30,
            min_stock: 15,
            supplier: 'Dairy Farm Co.'
          }
        ];

        let inserted = 0;
        sampleItems.forEach((item) => {
          this.addItem(item).then(() => {
            inserted++;
            if (inserted === sampleItems.length) {
              console.log('Sample data inserted');
              resolve();
            }
          });
        });
      });
    });
  }

  // Item operations
  async getAllItems() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM items ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getItemById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM items WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getItemByBarcode(barcode) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM items WHERE barcode = ?', [barcode], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async searchItems(searchTerm) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM items 
        WHERE name LIKE ? OR description LIKE ? OR barcode LIKE ? OR category LIKE ?
        ORDER BY name
      `;
      const term = `%${searchTerm}%`;
      this.db.all(query, [term, term, term, term], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async addItem(item) {
    return new Promise((resolve, reject) => {
      // Validate required fields
      if (!item.name || item.name.trim() === '') {
        reject(new Error('Item name is required'));
        return;
      }
      
      if (item.price === undefined || item.price === null || isNaN(item.price)) {
        reject(new Error('Valid item price is required'));
        return;
      }
      
      const id = item.id || uuidv4();
      
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const query = `
          INSERT INTO items (id, name, description, barcode, category, price, cost, quantity, min_stock, supplier)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
          id, 
          item.name.trim(), 
          item.description ? item.description.trim() : '', 
          item.barcode ? item.barcode.trim() : '', 
          item.category ? item.category.trim() : '',
          parseFloat(item.price) || 0, 
          parseFloat(item.cost) || 0, 
          parseInt(item.quantity) || 1, 
          parseInt(item.min_stock) || 0, 
          item.supplier ? item.supplier.trim() : ''
        ], function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
          } else {
            db.run('COMMIT');
            resolve({ id, ...item, quantity: parseInt(item.quantity) || 1 });
          }
        });
      });
    });
  }

  async updateItem(id, item) {
    return new Promise((resolve, reject) => {
      // Validate required fields
      if (!item.name || item.name.trim() === '') {
        reject(new Error('Item name is required'));
        return;
      }
      
      if (item.price === undefined || item.price === null || isNaN(item.price)) {
        reject(new Error('Valid item price is required'));
        return;
      }
      
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const query = `
          UPDATE items 
          SET name = ?, description = ?, barcode = ?, category = ?, 
              price = ?, cost = ?, quantity = ?, min_stock = ?, supplier = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(query, [
          item.name.trim(), 
          item.description ? item.description.trim() : '', 
          item.barcode ? item.barcode.trim() : '', 
          item.category ? item.category.trim() : '',
          parseFloat(item.price) || 0, 
          parseFloat(item.cost) || 0, 
          parseInt(item.quantity) || 1, 
          parseInt(item.min_stock) || 0, 
          item.supplier ? item.supplier.trim() : '', 
          id
        ], function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
          } else {
            db.run('COMMIT');
            resolve({ id, ...item });
          }
        });
      });
    });
  }

  async deleteItem(id) {
    return new Promise((resolve, reject) => {
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Check if item exists in any orders first
        db.get('SELECT COUNT(*) as count FROM order_items WHERE item_id = ?', [id], (err, result) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          if (result.count > 0) {
            db.run('ROLLBACK');
            reject(new Error('Cannot delete item that exists in order history. Consider marking it as inactive instead.'));
            return;
          }
          
          // Delete the item
          db.run('DELETE FROM items WHERE id = ?', [id], function(err) {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
            } else {
              db.run('COMMIT');
              resolve({ deleted: this.changes > 0 });
            }
          });
        });
      });
    });
  }

  async getLowStockItems(threshold = 10) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM items WHERE quantity <= min_stock OR quantity <= ?', [threshold], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Order operations
  async createOrder(orderData) {
    return new Promise((resolve, reject) => {
      const orderId = uuidv4();
      const orderNumber = 'ORD-' + Date.now();
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Insert order
        const orderQuery = `
          INSERT INTO orders (id, order_number, customer_name, customer_phone, 
                            total_amount, tax_amount, discount_amount, payment_method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(orderQuery, [
          orderId, orderNumber, orderData.customer_name, orderData.customer_phone,
          orderData.total_amount, orderData.tax_amount || 0, 
          orderData.discount_amount || 0, orderData.payment_method || 'cash'
        ], (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          // Insert order items
          let itemsProcessed = 0;
          const orderItems = orderData.items || [];
          
          if (orderItems.length === 0) {
            db.run('COMMIT');
            resolve({ id: orderId, order_number: orderNumber, ...orderData });
            return;
          }
          
          orderItems.forEach((item) => {
            const itemQuery = `
              INSERT INTO order_items (id, order_id, item_id, quantity, unit_price, total_price)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            db.run(itemQuery, [
              uuidv4(), orderId, item.item_id, item.quantity, 
              item.unit_price, item.total_price
            ], (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              // Get current item details for stock history
              db.get('SELECT name, barcode, quantity FROM items WHERE id = ?', [item.item_id], (err, itemDetails) => {
                if (err) {
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }
                
                if (!itemDetails) {
                  db.run('ROLLBACK');
                  reject(new Error(`Item with ID ${item.item_id} not found`));
                  return;
                }
                
                const previousStock = itemDetails.quantity;
                const newStock = previousStock - item.quantity;
                
                if (newStock < 0) {
                  db.run('ROLLBACK');
                  reject(new Error(`Insufficient stock for item: ${itemDetails.name}. Available: ${previousStock}, Required: ${item.quantity}`));
                  return;
                }
                
                // Update item quantity
                db.run('UPDATE items SET quantity = quantity - ? WHERE id = ?', 
                  [item.quantity, item.item_id], (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  
                  // Add stock history record
                  const historyQuery = `
                    INSERT INTO stock_history (item_id, item_name, barcode, type, quantity, previous_stock, new_stock, reference)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  `;
                  
                  db.run(historyQuery, [
                    item.item_id,
                    itemDetails.name,
                    itemDetails.barcode,
                    'out',
                    item.quantity,
                    previousStock,
                    newStock,
                    `Order #${orderNumber}`
                  ], (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    itemsProcessed++;
                    if (itemsProcessed === orderItems.length) {
                      db.run('COMMIT');
                      resolve({ id: orderId, order_number: orderNumber, ...orderData });
                    }
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  async getAllOrders() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT o.*, 
               GROUP_CONCAT(i.name) as item_names,
               COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN items i ON oi.item_id = i.id
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `;
      
      this.db.all(query, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getOrderById(id) {
    return new Promise((resolve, reject) => {
      const orderQuery = 'SELECT * FROM orders WHERE id = ?';
      
      this.db.get(orderQuery, [id], (err, order) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!order) {
          resolve(null);
          return;
        }
        
        const itemsQuery = `
          SELECT oi.*, i.name, i.barcode 
          FROM order_items oi
          JOIN items i ON oi.item_id = i.id
          WHERE oi.order_id = ?
        `;
        
        this.db.all(itemsQuery, [id], (err, items) => {
          if (err) reject(err);
          else resolve({ ...order, items });
        });
      });
    });
  }

  // Settings methods
  async getSetting(key) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT value FROM settings WHERE key = ?';
      this.db.get(query, [key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  }

  async setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `;
      this.db.run(query, [key, value], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getAllSettings() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT key, value FROM settings';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const settings = {};
          rows.forEach(row => {
            settings[row.key] = row.value;
          });
          resolve(settings);
        }
      });
    });
  }

  async initializeDefaultSettings() {
    const defaults = {
      companyName: 'INVENTORY MANAGEMENT SYSTEM',
      trnNumber: '',
      currencyCode: '$',
      currencySymbol: '$',
      taxRate: '10',
      address: '',
      phone: '',
      email: ''
    };

    for (const [key, value] of Object.entries(defaults)) {
      const existing = await this.getSetting(key);
      if (existing === null) {
        await this.setSetting(key, value);
      }
    }
  }

  // Stock History Methods
  async addStockHistory(itemId, itemName, barcode, type, quantity, previousStock, newStock, reference = null) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO stock_history (item_id, item_name, barcode, type, quantity, previous_stock, new_stock, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(query, [itemId, itemName, barcode, type, quantity, previousStock, newStock, reference], function(err) {
        if (err) {
          console.error('Error adding stock history:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getStockHistory(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT * FROM stock_history 
        WHERE 1=1
      `;
      const params = [];

      if (filters.itemName) {
        query += ` AND item_name LIKE ?`;
        params.push(`%${filters.itemName}%`);
      }

      if (filters.type) {
        query += ` AND type = ?`;
        params.push(filters.type);
      }

      if (filters.dateFrom) {
        query += ` AND created_at >= ?`;
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND created_at <= ?`;
        params.push(filters.dateTo);
      }

      query += ` ORDER BY created_at DESC`;

      this.db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error getting stock history:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateItemStock(itemId, newQuantity) {
    return new Promise((resolve, reject) => {
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const query = `UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        db.run(query, [newQuantity, itemId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            console.error('Error updating item stock:', err);
            reject(err);
          } else {
            db.run('COMMIT');
            resolve(this.changes);
          }
        });
      });
    });
  }

  // Atomic stock adjustment with history tracking
  async adjustItemStock(itemId, quantityChange, type, reference = null) {
    return new Promise((resolve, reject) => {
      const db = this.db; // Store reference to avoid 'this' context issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // First get current item details
        const getItemQuery = `SELECT id, name, barcode, quantity FROM items WHERE id = ?`;
        db.get(getItemQuery, [itemId], (err, item) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          if (!item) {
            db.run('ROLLBACK');
            reject(new Error('Item not found'));
            return;
          }
          
          const previousStock = item.quantity;
          const newStock = previousStock + quantityChange;
          
          if (newStock < 0) {
            db.run('ROLLBACK');
            reject(new Error('Insufficient stock. Cannot reduce quantity below zero.'));
            return;
          }
          
          // Update item stock
          const updateQuery = `UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          db.run(updateQuery, [newStock, itemId], (err) => {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            // Add stock history record
            const historyQuery = `
              INSERT INTO stock_history (item_id, item_name, barcode, type, quantity, previous_stock, new_stock, reference)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(historyQuery, [
              itemId, 
              item.name, 
              item.barcode, 
              type, 
              Math.abs(quantityChange), 
              previousStock, 
              newStock, 
              reference
            ], (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT');
                resolve({
                  itemId,
                  previousStock,
                  newStock,
                  quantityChange
                });
              }
            });
          });
        });
      });
    });
  }

  // Authentication Methods
  async createUser(username, email, passwordHash) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO users (username, email, password_hash)
        VALUES (?, ?, ?)
      `;
      
      this.db.run(query, [username, email, passwordHash], function(err) {
        if (err) {
          console.error('Error creating user:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM users WHERE email = ? AND is_active = 1`;
      
      this.db.get(query, [email], (err, row) => {
        if (err) {
          console.error('Error getting user by email:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateUserPassword(email, newPasswordHash) {
    return new Promise((resolve, reject) => {
      const query = `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?`;
      
      this.db.run(query, [newPasswordHash, email], function(err) {
        if (err) {
          console.error('Error updating user password:', err);
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async initializeDefaultUser() {
    try {      
      // Check if default user exists
      const existingUser = await this.getUserByEmail('admin@webo-save.com');
      
      if (!existingUser) {
        const crypto = require('crypto');
        const password = '9876qwer';
        const salt = crypto.randomBytes(32).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        const passwordHash = salt + ':' + hash;
        
        await this.createUser('admin', 'admin@webo-save.com', passwordHash);
      }
    } catch (error) {
      console.error('Error initializing default user:', error);
    }
  }

  async deleteUser(email) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM users WHERE email = ?`;
      
      this.db.run(query, [email], function(err) {
        if (err) {
          console.error('Error deleting user:', err);
          reject(err);
        } else {
          console.log('User deleted:', this.changes);
          resolve(this.changes);
        }
      });
    });
  }
}

module.exports = Database;
