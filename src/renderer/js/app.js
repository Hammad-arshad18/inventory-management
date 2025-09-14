const { ipcRenderer } = require('electron');

class InventoryApp {
    constructor() {
        this.currentTab = 'dashboard';
        this.cart = [];
        this.html5QrCode = null;
        this.currentItem = null;
        this.currentOrder = null;
        this.searchTimeout = null;
        this.barcodeSearchTimeout = null;
        this.orderSearchTimeout = null;
        this.stockSearchTimeout = null;
        this.historySearchTimeout = null;
        this.settings = {};
        this.allOrders = [];
        this.filteredOrders = [];
        this.allItems = [];
        this.filteredItems = [];
        this.allHistory = [];
        this.filteredHistory = [];
        this.isAuthenticated = false;
        this.currentUser = null;
        
        this.init();
    }

    async init() {
        try {
            // Wait for DOM to be fully loaded
            if (document.readyState !== 'complete') {
                await new Promise(resolve => {
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', resolve);
                    } else {
                        resolve();
                    }
                });
            }

            // Configure moment.js to use local timezone
            if (typeof moment !== 'undefined') {
                if (moment.tz) {
                    // Get the user's local timezone using moment-timezone
                    const localTimezone = moment.tz.guess();
                    console.log('Detected local timezone:', localTimezone);
                    
                    // Set moment to use local timezone by default
                    moment.tz.setDefault(localTimezone);
                } else {
                    // Fallback: moment.js will automatically use local timezone
                    console.log('Using moment.js default local timezone');
                }
            }

            // Initialize database
            await ipcRenderer.invoke('init-database');
            
            // Initialize default user
            await ipcRenderer.invoke('initialize-default-user');

            // Check authentication
            await this.checkAuthentication();
            
            // Load initial data
            await this.loadDashboard();
            
            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            // Try to show alert even if DOM isn't ready
            setTimeout(() => {
                this.showAlert('Failed to initialize application', 'danger');
            }, 1000);
        }
    }

    async checkAuthentication() {
        try {
            // Check if user is already authenticated (from localStorage)
            const savedAuth = localStorage.getItem('inventory_auth');
            if (savedAuth) {
                const authData = JSON.parse(savedAuth);
                this.isAuthenticated = true;
                this.currentUser = authData.user;
                this.showMainApp();
                return;
            }

            // Show login screen
            this.showLoginScreen();
        } catch (error) {
            console.error('Authentication check failed:', error);
            this.showLoginScreen();
        }
    }

    showLoginScreen() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';
        this.setupLoginEventListeners();
    }

    showMainApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        this.setupEventListeners();
        this.initializeSettings();
        this.loadDashboard();
    }

    setupLoginEventListeners() {
        // Login form submission
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Password toggle buttons
        const togglePassword = document.getElementById('togglePassword');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => this.togglePasswordVisibility('loginPassword', 'togglePassword'));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('loginBtn');
        
        if (!email || !password) {
            this.showAlert('Please enter both email and password', 'error');
            return;
        }

        try {
            // Show loading state
            loginBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Signing In...';
            loginBtn.disabled = true;

            // Authenticate user (password comparison is done in main process with bcrypt)
            console.log('Attempting login with:', email);
            const user = await ipcRenderer.invoke('authenticate-user', email, password);
            console.log('Authentication result:', user ? 'Success' : 'Failed');
            
            if (user) {
                // Login successful
                this.isAuthenticated = true;
                this.currentUser = user;
                
                // Save authentication to localStorage (without password hash for security)
                const userData = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at
                };
                
                localStorage.setItem('inventory_auth', JSON.stringify({
                    user: userData,
                    timestamp: Date.now()
                }));

                // Update UI
                const userName = document.getElementById('userName');
                if (userName) {
                    userName.textContent = user.username || 'Admin User';
                }

                this.showMainApp();
                this.showAlert('Login successful!', 'success');
            } else {
                this.showAlert('Invalid email or password', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showAlert('Login failed. Please try again.', 'error');
        } finally {
            // Reset button state
            loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Sign In';
            loginBtn.disabled = false;
        }
    }

    async handleLogout() {
        try {
            // Clear authentication
            this.isAuthenticated = false;
            this.currentUser = null;
            localStorage.removeItem('inventory_auth');
            
            // Show login screen
            this.showLoginScreen();
            this.showAlert('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    togglePasswordVisibility(inputId, toggleId) {
        const input = document.getElementById(inputId);
        const toggle = document.getElementById(toggleId);
        
        if (input.type === 'password') {
            input.type = 'text';
            toggle.innerHTML = '<i class="bi bi-eye-slash"></i>';
        } else {
            input.type = 'password';
            toggle.innerHTML = '<i class="bi bi-eye"></i>';
        }
    }

    setupEventListeners() {
        try {
            // Sidebar toggle functionality
            const sidebarToggle = document.getElementById('sidebarToggle');
            const menuToggle = document.getElementById('menuToggle');
            const sidebar = document.getElementById('sidebar');
            
            if (sidebarToggle && sidebar) {
                sidebarToggle.addEventListener('click', () => {
                    sidebar.classList.toggle('collapsed');
                });
            }
            
            if (menuToggle && sidebar) {
                menuToggle.addEventListener('click', () => {
                    sidebar.classList.toggle('mobile-open');
                });
            }

            // Tab navigation
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tabName = e.currentTarget.dataset.tab;
                    this.switchTab(tabName);
                    
                    // Close mobile sidebar after navigation
                    if (window.innerWidth <= 1024 && sidebar) {
                        sidebar.classList.remove('mobile-open');
                    }
                });
            });

            // Refresh button
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    this.refreshCurrentTab();
                });
            }

            // Inventory management
            const addItemBtn = document.getElementById('addItemBtn');
            if (addItemBtn) {
                addItemBtn.addEventListener('click', () => {
                    this.openItemModal();
                });
            }

            const saveItemBtn = document.getElementById('saveItemBtn');
            if (saveItemBtn) {
                saveItemBtn.addEventListener('click', () => {
                    this.saveItem();
                });
            }

            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) {
                searchBtn.addEventListener('click', () => {
                    this.searchItems();
                });
            }

            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.searchItems();
                    }
                });

                // Real-time search for inventory
                searchInput.addEventListener('input', () => {
                    clearTimeout(this.searchTimeout);
                    this.searchTimeout = setTimeout(() => {
                        this.searchItems();
                    }, 300);
                });
            }

            // POS functionality
            const barcodeInput = document.getElementById('barcodeInput');
            if (barcodeInput) {
                barcodeInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.searchByBarcode();
                    }
                });

                // Enhanced barcode input with live search
                barcodeInput.addEventListener('input', (e) => {
                    clearTimeout(this.barcodeSearchTimeout);
                    const value = e.target.value.trim();
                    
                    if (value.length > 2) {
                        this.barcodeSearchTimeout = setTimeout(() => {
                            this.performItemSearch(value);
                        }, 300);
                    } else {
                        this.hideSearchResults();
                    }
                });
            }

            const scanBtn = document.getElementById('scanBtn');
            if (scanBtn) {
                scanBtn.addEventListener('click', () => {
                    this.startBarcodeScanner();
                });
            }

            const stopScanBtn = document.getElementById('stopScanBtn');
            if (stopScanBtn) {
                stopScanBtn.addEventListener('click', () => {
                    this.stopBarcodeScanner();
                });
            }

            const addToCartBtn = document.getElementById('addToCartBtn');
            if (addToCartBtn) {
                addToCartBtn.addEventListener('click', () => {
                    this.addToCart();
                });
            }

            const clearCartBtn = document.getElementById('clearCartBtn');
            if (clearCartBtn) {
                clearCartBtn.addEventListener('click', () => {
                    this.clearCart();
                });
            }

            const checkoutBtn = document.getElementById('checkoutBtn');
            if (checkoutBtn) {
                checkoutBtn.addEventListener('click', () => {
                    this.checkout();
                });
            }

            // Receipt printing
            const printReceiptBtn = document.getElementById('printReceiptBtn');
            if (printReceiptBtn) {
                printReceiptBtn.addEventListener('click', () => {
                    this.printReceipt();
                });
            }

            const printOrderReceiptBtn = document.getElementById('printOrderReceiptBtn');
            if (printOrderReceiptBtn) {
                printOrderReceiptBtn.addEventListener('click', () => {
                    this.printOrderReceipt();
                });
            }

            // Global search functionality
            const globalSearch = document.getElementById('globalSearch');
            if (globalSearch) {
                globalSearch.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.performGlobalSearch();
                    }
                });
            }

            // Logout button
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.handleLogout());
            }

            // Menu events from main process
            ipcRenderer.on('menu-new-item', () => {
                this.switchTab('inventory');
                this.openItemModal();
            });

            // Settings event listeners
            const settingsForm = document.getElementById('settingsForm');
            if (settingsForm) {
                settingsForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveSettings();
                });
            }

            const resetSettings = document.getElementById('resetSettings');
            if (resetSettings) {
                resetSettings.addEventListener('click', () => {
                    this.resetSettings();
                });
            }

            // Password change form
            const passwordChangeForm = document.getElementById('passwordChangeForm');
            if (passwordChangeForm) {
                passwordChangeForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handlePasswordChange();
                });
            }

            // Password toggle buttons for settings
            const toggleCurrentPassword = document.getElementById('toggleCurrentPassword');
            if (toggleCurrentPassword) {
                toggleCurrentPassword.addEventListener('click', () => this.togglePasswordVisibility('currentPassword', 'toggleCurrentPassword'));
            }

            const toggleNewPassword = document.getElementById('toggleNewPassword');
            if (toggleNewPassword) {
                toggleNewPassword.addEventListener('click', () => this.togglePasswordVisibility('newPassword', 'toggleNewPassword'));
            }

            const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
            if (toggleConfirmPassword) {
                toggleConfirmPassword.addEventListener('click', () => this.togglePasswordVisibility('confirmPassword', 'toggleConfirmPassword'));
            }

            const currencyCode = document.getElementById('currencyCode');
            if (currencyCode) {
                currencyCode.addEventListener('change', () => {
                    this.updateCurrencySymbol();
                    this.updateReceiptPreview();
                });
            }

            // Update preview when any setting field changes
            const settingsFields = ['companyName', 'trnNumber', 'address', 'phone', 'email'];
            settingsFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.addEventListener('input', () => {
                        this.updateReceiptPreview();
                    });
                }
            });

            // Orders filtering event listeners
            const orderSearchInput = document.getElementById('orderSearchInput');
            if (orderSearchInput) {
                orderSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.filterOrders();
                    }
                });
                orderSearchInput.addEventListener('input', () => {
                    clearTimeout(this.orderSearchTimeout);
                    this.orderSearchTimeout = setTimeout(() => {
                        this.filterOrders();
                    }, 300);
                });
            }

            const filterOrdersBtn = document.getElementById('filterOrdersBtn');
            if (filterOrdersBtn) {
                filterOrdersBtn.addEventListener('click', () => {
                    this.filterOrders();
                });
            }

            const clearOrderFiltersBtn = document.getElementById('clearOrderFiltersBtn');
            if (clearOrderFiltersBtn) {
                clearOrderFiltersBtn.addEventListener('click', () => {
                    this.clearOrderFilters();
                });
            }

            // Quick filter buttons
            const filterTodayBtn = document.getElementById('filterTodayBtn');
            if (filterTodayBtn) {
                filterTodayBtn.addEventListener('click', () => {
                    this.setDateFilter('today');
                });
            }

            const filterYesterdayBtn = document.getElementById('filterYesterdayBtn');
            if (filterYesterdayBtn) {
                filterYesterdayBtn.addEventListener('click', () => {
                    this.setDateFilter('yesterday');
                });
            }

            const filterThisWeekBtn = document.getElementById('filterThisWeekBtn');
            if (filterThisWeekBtn) {
                filterThisWeekBtn.addEventListener('click', () => {
                    this.setDateFilter('thisWeek');
                });
            }

            const filterThisMonthBtn = document.getElementById('filterThisMonthBtn');
            if (filterThisMonthBtn) {
                filterThisMonthBtn.addEventListener('click', () => {
                    this.setDateFilter('thisMonth');
                });
            }

            const filterLastMonthBtn = document.getElementById('filterLastMonthBtn');
            if (filterLastMonthBtn) {
                filterLastMonthBtn.addEventListener('click', () => {
                    this.setDateFilter('lastMonth');
                });
            }

            // Add Stock tab event listeners
            const stockSearchInput = document.getElementById('stockSearchInput');
            if (stockSearchInput) {
                stockSearchInput.addEventListener('input', () => {
                    clearTimeout(this.stockSearchTimeout);
                    this.stockSearchTimeout = setTimeout(() => {
                        this.filterStockItems();
                    }, 300);
                });
            }

            const selectAllStockItems = document.getElementById('selectAllStockItems');
            if (selectAllStockItems) {
                selectAllStockItems.addEventListener('change', (e) => {
                    this.toggleAllStockItems(e.target.checked);
                });
            }

            const addStockBtn = document.getElementById('addStockBtn');
            if (addStockBtn) {
                addStockBtn.addEventListener('click', () => {
                    this.addStockToSelectedItems();
                });
            }

            const clearStockFormBtn = document.getElementById('clearStockFormBtn');
            if (clearStockFormBtn) {
                clearStockFormBtn.addEventListener('click', () => {
                    this.clearStockForm();
                });
            }

            // Inventory History tab event listeners
            const historySearchInput = document.getElementById('historySearchInput');
            if (historySearchInput) {
                historySearchInput.addEventListener('input', () => {
                    clearTimeout(this.historySearchTimeout);
                    this.historySearchTimeout = setTimeout(() => {
                        this.filterHistory();
                    }, 300);
                });
            }

            const filterHistoryBtn = document.getElementById('filterHistoryBtn');
            if (filterHistoryBtn) {
                filterHistoryBtn.addEventListener('click', () => {
                    this.filterHistory();
                });
            }

            const clearHistoryFiltersBtn = document.getElementById('clearHistoryFiltersBtn');
            if (clearHistoryFiltersBtn) {
                clearHistoryFiltersBtn.addEventListener('click', () => {
                    this.clearHistoryFilters();
                });
            }

        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    async switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Update page title and breadcrumb
        const pageTitle = document.getElementById('pageTitle');
        const breadcrumb = document.getElementById('breadcrumb');
        
        const titles = {
            dashboard: { title: 'Dashboard', breadcrumb: 'Overview' },
            inventory: { title: 'Inventory', breadcrumb: 'Manage Items' },
            pos: { title: 'Point of Sale', breadcrumb: 'Sales Terminal' },
            orders: { title: 'Orders', breadcrumb: 'Order History' },
            'add-stock': { title: 'Add Stock', breadcrumb: 'Stock Management' },
            'inventory-history': { title: 'Inventory History', breadcrumb: 'Stock Movements' },
            settings: { title: 'Settings', breadcrumb: 'System Configuration' }
        };
        
        if (pageTitle && breadcrumb && titles[tabName]) {
            pageTitle.textContent = titles[tabName].title;
            breadcrumb.textContent = titles[tabName].breadcrumb;
        }

        this.currentTab = tabName;

        // Load tab-specific data
        switch (tabName) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'inventory':
                await this.loadInventory();
                break;
            case 'pos':
                await this.loadPOS();
                break;
            case 'orders':
                await this.loadOrders();
                break;
            case 'add-stock':
                await this.loadStockItems();
                break;
            case 'inventory-history':
                await this.loadInventoryHistory();
                break;
            case 'settings':
                await this.loadSettings();
                break;
        }
    }

    async refreshCurrentTab() {
        await this.switchTab(this.currentTab);
    }

    // Dashboard functionality
    async loadDashboard() {
        try {
            const [items, orders, lowStockItems] = await Promise.all([
                ipcRenderer.invoke('get-all-items'),
                ipcRenderer.invoke('get-all-orders'),
                ipcRenderer.invoke('get-low-stock-items')
            ]);

            // Update dashboard stats
            const totalItems = items.length;
            const totalValue = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const lowStockCount = lowStockItems.length;
            
            // Today's orders
            const today = new Date().toDateString();
            const todayOrders = orders.filter(order => 
                new Date(order.created_at).toDateString() === today
            ).length;

            // Update dashboard stats with null checks
            const totalItemsEl = document.getElementById('totalItems');
            if (totalItemsEl) totalItemsEl.textContent = totalItems;
            
            const totalValueEl = document.getElementById('totalValue');
            if (totalValueEl) totalValueEl.textContent = `${this.settings.currencySymbol || '$'}${totalValue.toFixed(2)}`;
            
            const lowStockCountEl = document.getElementById('lowStockCount');
            if (lowStockCountEl) lowStockCountEl.textContent = lowStockCount;
            
            const todayOrdersEl = document.getElementById('todayOrders');
            if (todayOrdersEl) todayOrdersEl.textContent = todayOrders;

            // Update low stock items
            this.renderLowStockItems(lowStockItems);
            
            // Update recent orders
            this.renderRecentOrders(orders.slice(0, 5));

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showAlert('Failed to load dashboard data', 'danger');
        }
    }

    renderLowStockItems(items) {
        const container = document.getElementById('lowStockItems');
        
        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center text-success py-3">
                    <i class="bi bi-check-circle fs-3"></i>
                    <p>All items are well stocked!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                    <strong>${item.name}</strong><br>
                    <small class="text-muted">Current: ${item.quantity} | Min: ${item.min_stock}</small>
                </div>
                <span class="badge ${item.quantity === 0 ? 'bg-danger' : 'bg-warning'}">
                    ${item.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                </span>
            </div>
        `).join('');
    }

    renderRecentOrders(orders) {
        const container = document.getElementById('recentOrders');
        
        if (orders.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="bi bi-receipt fs-3"></i>
                    <p>No recent orders</p>
                </div>
            `;
            return;
        }

        container.innerHTML = orders.map(order => `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                    <strong>${order.order_number}</strong><br>
                    <small class="text-muted">${this.formatLocalDate(order.created_at, 'MMM DD, YYYY')}</small>
                </div>
                <div class="text-end">
                    <strong>${this.settings.currencySymbol || '$'}${parseFloat(order.total_amount).toFixed(2)}</strong><br>
                    <small class="text-muted">${order.customer_name || 'Walk-in'}</small>
                </div>
            </div>
        `).join('');
    }

    // Inventory functionality
    async loadInventory() {
        try {
            const items = await ipcRenderer.invoke('get-all-items');
            this.renderInventoryTable(items);
        } catch (error) {
            console.error('Failed to load inventory:', error);
            this.showAlert('Failed to load inventory', 'danger');
        }
    }

    renderInventoryTable(items) {
        const tbody = document.getElementById('inventoryTable');
        
        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <div class="d-flex flex-column align-items-center justify-content-center" style="min-height: 200px;">
                            <i class="bi bi-box fs-1 text-secondary mb-3"></i>
                            <h6 class="text-secondary">No items in inventory</h6>
                            <p class="text-light mb-0">Start by adding your first item</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const status = this.getStockStatus(item);
            return `
                <tr>
                    <td>
                        <div class="d-flex flex-column">
                            <strong class="text-primary mb-1">${item.name}</strong>
                            <small class="text-secondary">${item.description || 'No description'}</small>
                        </div>
                    </td>
                    <td>
                        <code class="bg-light px-2 py-1 rounded text-dark">${item.barcode || '-'}</code>
                    </td>
                    <td>
                        <span class="modern-badge badge-info">${item.category || 'Uncategorized'}</span>
                    </td>
                    <td>
                        <strong class="text-success">${this.settings.currencySymbol || '$'}${parseFloat(item.price).toFixed(2)}</strong>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-bold">${item.quantity}</span>
                            <small class="text-secondary">units</small>
                        </div>
                    </td>
                    <td>
                        <span class="modern-badge ${status.class}">${status.text}</span>
                    </td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn-modern btn-sm btn-secondary" onclick="app.editItem('${item.id}')" title="Edit Item">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn-modern btn-sm btn-danger" onclick="app.deleteItem('${item.id}', '${item.name}')" title="Delete Item">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    getStockStatus(item) {
        if (item.quantity === 0) {
            return { class: 'badge-danger', text: 'Out of Stock' };
        } else if (item.quantity <= item.min_stock) {
            return { class: 'badge-warning', text: 'Low Stock' };
        } else {
            return { class: 'badge-success', text: 'In Stock' };
        }
    }

    async searchItems() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        
        try {
            let items;
            if (searchTerm) {
                items = await ipcRenderer.invoke('search-items', searchTerm);
            } else {
                items = await ipcRenderer.invoke('get-all-items');
            }
            
            this.renderInventoryTable(items);
        } catch (error) {
            console.error('Failed to search items:', error);
            this.showAlert('Failed to search items', 'danger');
        }
    }

    openItemModal(item = null) {
        const modal = new bootstrap.Modal(document.getElementById('itemModal'));
        const title = document.getElementById('itemModalTitle');
        
        // Update currency symbols in the modal
        const sellingPriceCurrency = document.getElementById('sellingPriceCurrency');
        const costPriceCurrency = document.getElementById('costPriceCurrency');
        
        if (sellingPriceCurrency) sellingPriceCurrency.textContent = this.settings.currencySymbol || '$';
        if (costPriceCurrency) costPriceCurrency.textContent = this.settings.currencySymbol || '$';
        
        if (item) {
            title.textContent = 'Edit Item';
            this.fillItemForm(item);
        } else {
            title.textContent = 'Add New Item';
            this.resetItemForm();
        }
        
        modal.show();
    }

    fillItemForm(item) {
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemNameInput').value = item.name;
        document.getElementById('itemDescriptionInput').value = item.description || '';
        document.getElementById('itemBarcodeInput').value = item.barcode || '';
        document.getElementById('itemCategoryInput').value = item.category || '';
        document.getElementById('itemPriceInput').value = item.price;
        document.getElementById('itemCostInput').value = item.cost || '';
        document.getElementById('itemQuantityInput').value = item.quantity;
        document.getElementById('itemMinStockInput').value = item.min_stock;
        document.getElementById('itemSupplierInput').value = item.supplier || '';
    }

    resetItemForm() {
        document.getElementById('itemForm').reset();
        document.getElementById('itemId').value = '';
        document.getElementById('itemMinStockInput').value = '10';
    }

    async saveItem() {
        const form = document.getElementById('itemForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const itemData = {
            name: document.getElementById('itemNameInput').value.trim(),
            description: document.getElementById('itemDescriptionInput').value.trim(),
            barcode: document.getElementById('itemBarcodeInput').value.trim(),
            category: document.getElementById('itemCategoryInput').value.trim(),
            price: parseFloat(document.getElementById('itemPriceInput').value),
            cost: parseFloat(document.getElementById('itemCostInput').value) || 0,
            quantity: parseInt(document.getElementById('itemQuantityInput').value),
            min_stock: parseInt(document.getElementById('itemMinStockInput').value),
            supplier: document.getElementById('itemSupplierInput').value.trim()
        };

        try {
            const itemId = document.getElementById('itemId').value;
            
            if (itemId) {
                await ipcRenderer.invoke('update-item', itemId, itemData);
                this.showAlert('Item updated successfully', 'success');
            } else {
                await ipcRenderer.invoke('add-item', itemData);
                this.showAlert('Item added successfully', 'success');
            }

            const modal = bootstrap.Modal.getInstance(document.getElementById('itemModal'));
            modal.hide();
            
            await this.loadInventory();
            
        } catch (error) {
            console.error('Failed to save item:', error);
            this.showAlert('Failed to save item: ' + error.message, 'danger');
        }
    }

    async editItem(itemId) {
        try {
            const item = await ipcRenderer.invoke('get-item-by-id', itemId);
            if (item) {
                this.openItemModal(item);
            }
        } catch (error) {
            console.error('Failed to load item:', error);
            this.showAlert('Failed to load item', 'danger');
        }
    }

    async deleteItem(itemId, itemName) {
        if (confirm(`Are you sure you want to delete "${itemName}"?`)) {
            try {
                await ipcRenderer.invoke('delete-item', itemId);
                this.showAlert('Item deleted successfully', 'success');
                await this.loadInventory();
            } catch (error) {
                console.error('Failed to delete item:', error);
                this.showAlert('Failed to delete item', 'danger');
            }
        }
    }

    // POS functionality
    async loadPOS() {
        this.clearCurrentItem();
        this.updateCartDisplay();
    }

    async searchByBarcode() {
        const barcode = document.getElementById('barcodeInput').value.trim();
        
        if (!barcode) {
            this.showAlert('Please enter a barcode', 'warning');
            return;
        }

        try {
            const item = await ipcRenderer.invoke('get-item-by-barcode', barcode);
            
            if (item) {
                this.displaySelectedItem(item);
            } else {
                this.showAlert('Item not found with barcode: ' + barcode, 'warning');
                this.clearCurrentItem();
            }
        } catch (error) {
            console.error('Failed to search by barcode:', error);
            this.showAlert('Failed to search by barcode', 'danger');
        }
    }

    startBarcodeScanner() {
        const scannerContainer = document.getElementById('scannerContainer');
        const reader = document.getElementById('reader');
        
        scannerContainer.classList.remove('d-none');
        
        this.html5QrCode = new Html5Qrcode("reader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        };

        this.html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                document.getElementById('barcodeInput').value = decodedText;
                this.stopBarcodeScanner();
                this.searchByBarcode();
            },
            (errorMessage) => {
                // Handle scan errors silently
            }
        ).catch(err => {
            console.error('Failed to start scanner:', err);
            this.showAlert('Failed to start camera scanner', 'danger');
            scannerContainer.classList.add('d-none');
        });
    }

    stopBarcodeScanner() {
        if (this.html5QrCode) {
            this.html5QrCode.stop().then(() => {
                document.getElementById('scannerContainer').classList.add('d-none');
                this.html5QrCode = null;
            }).catch(err => {
                console.error('Failed to stop scanner:', err);
            });
        }
    }

    displaySelectedItem(item) {
        this.currentItem = item;
        
        document.getElementById('itemName').textContent = item.name;
        document.getElementById('itemPrice').textContent = `${this.settings.currencySymbol || '$'}${parseFloat(item.price).toFixed(2)}`;
        document.getElementById('itemQuantity').textContent = item.quantity;
        document.getElementById('itemCategory').textContent = item.category || 'Uncategorized';
        document.getElementById('orderQuantity').value = '1';
        document.getElementById('orderQuantity').max = item.quantity;
        
        document.getElementById('selectedItem').classList.remove('d-none');
        this.hideSearchResults();
    }

    clearCurrentItem() {
        this.currentItem = null;
        document.getElementById('selectedItem').classList.add('d-none');
        document.getElementById('barcodeInput').value = '';
        this.hideSearchResults();
    }

    async performItemSearch(searchTerm) {
        try {
            const items = await ipcRenderer.invoke('search-items', searchTerm);
            
            if (items.length > 0) {
                this.showSearchResults(items.slice(0, 5)); // Show max 5 results
            } else {
                this.hideSearchResults();
            }
        } catch (error) {
            console.error('Search failed:', error);
            this.hideSearchResults();
        }
    }

    showSearchResults(items) {
        const searchResults = document.getElementById('searchResults');
        const searchResultsList = document.getElementById('searchResultsList');
        
        searchResultsList.innerHTML = items.map(item => `
            <div class="modern-card bg-light border-0 cursor-pointer search-result-item" 
                 onclick="app.selectSearchResult('${item.id}')" 
                 style="transition: all 0.2s; cursor: pointer;">
                <div class="modern-card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fw-bold text-primary">${item.name}</div>
                            <small class="text-secondary">${item.barcode || 'No barcode'} • ${item.category || 'Uncategorized'}</small>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold text-success">${this.settings.currencySymbol || '$'}${parseFloat(item.price).toFixed(2)}</div>
                            <small class="text-secondary">${item.quantity} in stock</small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        searchResults.classList.remove('d-none');
        
        // Add hover effects
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            });
            item.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'none';
            });
        });
    }

    hideSearchResults() {
        document.getElementById('searchResults').classList.add('d-none');
    }

    async selectSearchResult(itemId) {
        try {
            const item = await ipcRenderer.invoke('get-item-by-id', itemId);
            if (item) {
                this.displaySelectedItem(item);
                document.getElementById('barcodeInput').value = item.barcode || item.name;
            }
        } catch (error) {
            console.error('Failed to select item:', error);
            this.showAlert('Failed to select item', 'danger');
        }
    }

    addToCart() {
        if (!this.currentItem) {
            this.showAlert('No item selected', 'warning');
            return;
        }

        const quantity = parseInt(document.getElementById('orderQuantity').value);
        
        if (quantity <= 0 || quantity > this.currentItem.quantity) {
            this.showAlert('Invalid quantity', 'warning');
            return;
        }

        // Check if item already in cart
        const existingItemIndex = this.cart.findIndex(item => item.id === this.currentItem.id);
        
        if (existingItemIndex >= 0) {
            this.cart[existingItemIndex].cart_quantity += quantity;
        } else {
            this.cart.push({
                ...this.currentItem,
                cart_quantity: quantity
            });
        }

        this.updateCartDisplay();
        this.clearCurrentItem();
        this.showAlert('Item added to cart', 'success');
    }

    removeFromCart(itemId) {
        this.cart = this.cart.filter(item => item.id !== itemId);
        this.updateCartDisplay();
    }

    updateCartQuantity(itemId, newQuantity) {
        if (newQuantity <= 0) {
            this.removeFromCart(itemId);
            return;
        }

        const cartItem = this.cart.find(item => item.id === itemId);
        if (cartItem) {
            if (newQuantity <= cartItem.quantity) {
                cartItem.cart_quantity = newQuantity;
                this.updateCartDisplay();
            } else {
                this.showAlert('Not enough stock available', 'warning');
            }
        }
    }

    clearCart() {
        this.cart = [];
        this.updateCartDisplay();
    }

    updateCartDisplay() {
        const cartContainer = document.getElementById('cartItems');
        const checkoutBtn = document.getElementById('checkoutBtn');
        
        if (this.cart.length === 0) {
            cartContainer.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-cart-x fs-1 mb-3"></i>
                    <h6 class="text-secondary">Cart is empty</h6>
                    <p class="small text-light mb-0">Scan items to get started</p>
                </div>
            `;
            checkoutBtn.disabled = true;
        } else {
            cartContainer.innerHTML = this.cart.map(item => {
                const total = item.price * item.cart_quantity;
                return `
                    <div class="modern-card bg-light border mb-2">
                        <div class="modern-card-body p-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <div class="fw-bold text-primary mb-1">${item.name}</div>
                                    <div class="small text-secondary mb-2">
                                        ${this.settings.currencySymbol || '$'}${parseFloat(item.price).toFixed(2)} × ${item.cart_quantity} units
                                    </div>
                                    <div class="d-flex gap-2 align-items-center">
                                        <button class="btn-modern btn-sm btn-secondary" 
                                                onclick="app.updateCartQuantity('${item.id}', ${item.cart_quantity - 1})"
                                                ${item.cart_quantity <= 1 ? 'disabled' : ''}>
                                            <i class="bi bi-dash"></i>
                                        </button>
                                        <span class="fw-bold">${item.cart_quantity}</span>
                                        <button class="btn-modern btn-sm btn-secondary" 
                                                onclick="app.updateCartQuantity('${item.id}', ${item.cart_quantity + 1})"
                                                ${item.cart_quantity >= item.quantity ? 'disabled' : ''}>
                                            <i class="bi bi-plus"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="text-end">
                                    <div class="fw-bold text-success fs-5 mb-2">${this.settings.currencySymbol || '$'}${total.toFixed(2)}</div>
                                    <button class="btn-modern btn-sm btn-danger" 
                                            onclick="app.removeFromCart('${item.id}')"
                                            title="Remove item">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            checkoutBtn.disabled = false;
        }

        this.updateCartTotals();
    }

    updateCartTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.cart_quantity), 0);
        const taxRate = parseFloat(this.settings.taxRate || 0) / 100;
        const tax = taxRate > 0 ? subtotal * taxRate : 0;
        const total = subtotal + tax;

        document.getElementById('subtotal').textContent = `${this.settings.currencySymbol || '$'}${subtotal.toFixed(2)}`;
        
        // Show/hide tax row based on tax rate
        const taxElement = document.getElementById('tax');
        const taxRow = document.getElementById('taxRow');
        const taxLabel = document.getElementById('taxLabel');
        
        if (taxRate > 0 && taxElement) {
            if (taxRow) taxRow.style.display = 'flex';
            if (taxLabel) taxLabel.textContent = `Tax (${this.settings.taxRate}%):`;
            taxElement.textContent = `${this.settings.currencySymbol || '$'}${tax.toFixed(2)}`;
        } else if (taxRow) {
            taxRow.style.display = 'none';
        }
        
        document.getElementById('total').textContent = `${this.settings.currencySymbol || '$'}${total.toFixed(2)}`;
    }

    async checkout() {
        if (this.cart.length === 0) {
            this.showAlert('Cart is empty', 'warning');
            return;
        }

        const customerName = document.getElementById('customerName').value.trim();
        const customerPhone = document.getElementById('customerPhone').value.trim();
        
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.cart_quantity), 0);
        const taxRate = parseFloat(this.settings.taxRate || 0) / 100;
        const tax = taxRate > 0 ? subtotal * taxRate : 0;
        const total = subtotal + tax;

        const orderData = {
            customer_name: customerName || null,
            customer_phone: customerPhone || null,
            total_amount: total,
            tax_amount: tax,
            discount_amount: 0,
            payment_method: 'cash',
            items: this.cart.map(item => ({
                item_id: item.id,
                quantity: item.cart_quantity,
                unit_price: item.price,
                total_price: item.price * item.cart_quantity
            }))
        };

        try {
            const order = await ipcRenderer.invoke('create-order', orderData);
            
            // Create stock history records for each sold item
            for (const cartItem of this.cart) {
                const previousStock = cartItem.quantity;
                const newStock = previousStock - cartItem.cart_quantity;
                
                await ipcRenderer.invoke('add-stock-history', 
                    cartItem.id, 
                    cartItem.name, 
                    cartItem.barcode, 
                    'out', 
                    cartItem.cart_quantity, 
                    previousStock, 
                    newStock, 
                    `Order #${order.order_number}`
                );
            }
            
            this.showAlert('Order completed successfully!', 'success');
            
            // Generate and show receipt
            this.generateReceipt(order);
            
            // Clear cart and form
            this.clearCart();
            document.getElementById('customerName').value = '';
            document.getElementById('customerPhone').value = '';
            
        } catch (error) {
            console.error('Failed to complete order:', error);
            this.showAlert('Failed to complete order: ' + error.message, 'danger');
        }
    }

    generateReceipt(order) {
        const receiptContent = document.getElementById('receiptContent');
        const date = new Date(order.created_at || Date.now());
        const subtotal = order.total_amount - (order.tax_amount || 0);
        
        receiptContent.innerHTML = `
            <div class="receipt-modal" id="printableReceipt">
                <div style="text-align: center; margin-bottom: 30px; font-family: 'Courier New', monospace;">
                    <h2 style="font-weight: bold; margin-bottom: 15px; font-size: 18px; letter-spacing: 2px; line-height: 1.2;">${this.settings.companyName || 'INVENTORY MANAGEMENT SYSTEM'}</h2>
                    ${this.settings.address ? `<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.4;">${this.settings.address}</p>` : ''}
                    ${this.settings.phone || this.settings.email ? `<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.4;">
                        ${this.settings.phone ? `Phone: ${this.settings.phone}` : ''}
                        ${this.settings.phone && this.settings.email ? ' | ' : ''}
                        ${this.settings.email ? `Email: ${this.settings.email}` : ''}
                    </p>` : ''}
                    ${this.settings.trnNumber ? `<p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.4;">TRN: ${this.settings.trnNumber}</p>` : ''}
                    <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: normal;">Sales Receipt</p>
                    <div style="border-top: 1px solid #000; margin: 20px 0; width: 100%;"></div>
                </div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                        <span style="font-weight: bold;">Order #:</span>
                        <span>${order.order_number}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                        <span style="font-weight: bold;">Date:</span>
                        <span>${this.formatLocalDate(date)}</span>
                    </div>
                    ${order.customer_name ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                            <span style="font-weight: bold;">Customer:</span>
                            <span>${order.customer_name}</span>
                        </div>
                    ` : ''}
                    ${order.customer_phone ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                            <span style="font-weight: bold;">Phone:</span>
                            <span>${order.customer_phone}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div style="border-top: 1px solid #000; margin: 25px 0; width: 100%;"></div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace;">
                    ${this.cart.map(item => `
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; line-height: 1.6; font-size: 14px;">
                                <span style="font-weight: normal;">${item.name}</span>
                                <span style="font-weight: normal; text-align: right;">${this.settings.currencySymbol || '$'}${(item.price * item.cart_quantity).toFixed(2)}</span>
                            </div>
                            <div style="font-size: 13px; margin-left: 0; line-height: 1.4; color: #333;">
                                ${this.settings.currencySymbol || '$'}${parseFloat(item.price).toFixed(2)} x ${item.cart_quantity}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="border-top: 1px solid #000; margin: 25px 0; width: 100%;"></div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px; line-height: 1.8;">
                        <span>Subtotal:</span>
                        <span style="text-align: right;">${this.settings.currencySymbol || '$'}${subtotal.toFixed(2)}</span>
                    </div>
                    ${parseFloat(this.settings.taxRate || 0) > 0 ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; line-height: 1.8;">
                            <span>Tax (${this.settings.taxRate}%):</span>
                            <span style="text-align: right;">${this.settings.currencySymbol || '$'}${parseFloat(order.tax_amount || 0).toFixed(2)}</span>
                        </div>
                    ` : ''}
                    <div style="border-top: 2px solid #000; margin: 15px 0; width: 100%;"></div>
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; line-height: 2; margin-top: 10px;">
                        <span>TOTAL:</span>
                        <span style="text-align: right;">${this.settings.currencySymbol || '$'}${parseFloat(order.total_amount).toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 40px; font-family: 'Courier New', monospace;">
                    <p style="font-weight: normal; margin: 20px 0 10px 0; font-size: 14px; line-height: 1.6;">Thank you for your business!</p>
                    <p style="font-size: 13px; margin: 0; line-height: 1.6;">Please keep this receipt for your records.</p>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('receiptModal'));
        modal.show();
    }

    printReceipt() {
        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        const receiptContent = document.getElementById('printableReceipt');
        
        if (receiptContent) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Receipt - ${document.querySelector('.text-primary')?.textContent || 'Order'}</title>
                    <style>
                        body {
                            font-family: 'Courier New', Courier, monospace;
                            margin: 20px;
                            line-height: 1.5;
                            font-size: 14px;
                        }
                        .receipt {
                            max-width: 400px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .text-center { text-align: center; }
                        
                        /* Header Styles */
                        .receipt-title {
                            font-size: 16px;
                            font-weight: bold;
                            margin: 0 0 8px 0;
                            letter-spacing: 1px;
                        }
                        .receipt-subtitle {
                            font-size: 14px;
                            margin: 0 0 20px 0;
                        }
                        
                        /* Line Styles */
                        .receipt-line {
                            border-top: 1px solid #000;
                            margin: 15px 0;
                        }
                        .receipt-line-thick {
                            border-top: 2px solid #000;
                            margin: 10px 0;
                        }
                        
                        /* Info and Row Styles */
                        .receipt-row, .receipt-total-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 4px;
                        }
                        .receipt-label {
                            font-weight: normal;
                        }
                        .receipt-value {
                            font-weight: normal;
                        }
                        .receipt-label-bold {
                            font-weight: bold;
                            font-size: 16px;
                        }
                        .receipt-value-bold {
                            font-weight: bold;
                            font-size: 16px;
                        }
                        
                        /* Item Styles */
                        .receipt-item-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 2px;
                        }
                        .receipt-item-name {
                            font-weight: normal;
                        }
                        .receipt-item-price {
                            font-weight: normal;
                        }
                        .receipt-item-details {
                            font-size: 12px;
                            margin-bottom: 8px;
                            margin-left: 0;
                        }
                        
                        /* Footer Styles */
                        .receipt-thanks {
                            font-weight: normal;
                            margin: 20px 0 8px 0;
                        }
                        .receipt-note {
                            font-size: 12px;
                            margin: 0;
                        }
                        
                        /* Spacing */
                        .mb-3 { margin-bottom: 12px; }
                        .mb-4 { margin-bottom: 16px; }
                        .mt-4 { margin-top: 16px; }
                        .my-2 { margin: 8px 0; }
                        
                        /* Print Styles */
                        @media print {
                            body { 
                                margin: 0; 
                                font-size: 12px;
                            }
                            .receipt { 
                                max-width: none;
                                padding: 10px;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${receiptContent.outerHTML}
                </body>
                </html>
            `);
            
            printWindow.document.close();
            
            // Wait for content to load then print
            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            };
        } else {
            // Fallback to regular window print
            window.print();
        }
    }

    printOrderReceipt() {
        if (!this.currentOrder) {
            this.showAlert('No order selected for printing', 'warning');
            return;
        }

        // Create a temporary receipt for the order
        const tempDiv = document.createElement('div');
        const date = new Date(this.currentOrder.created_at || Date.now());
        const subtotal = this.currentOrder.total_amount - (this.currentOrder.tax_amount || 0);
        
        tempDiv.innerHTML = `
            <div class="receipt" id="tempOrderReceipt">
                <div style="text-align: center; margin-bottom: 30px; font-family: 'Courier New', monospace;">
                    <h2 style="font-weight: bold; margin-bottom: 15px; font-size: 18px; letter-spacing: 2px; line-height: 1.2;">${this.settings.companyName || 'INVENTORY MANAGEMENT SYSTEM'}</h2>
                    ${this.settings.address ? `<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.4;">${this.settings.address}</p>` : ''}
                    ${this.settings.phone || this.settings.email ? `<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.4;">
                        ${this.settings.phone ? `Phone: ${this.settings.phone}` : ''}
                        ${this.settings.phone && this.settings.email ? ' | ' : ''}
                        ${this.settings.email ? `Email: ${this.settings.email}` : ''}
                    </p>` : ''}
                    ${this.settings.trnNumber ? `<p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.4;">TRN: ${this.settings.trnNumber}</p>` : ''}
                    <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: normal;">Sales Receipt</p>
                    <div style="border-top: 1px solid #000; margin: 20px 0; width: 100%;"></div>
                </div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                        <span style="font-weight: bold;">Order #:</span>
                        <span>${this.currentOrder.order_number}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                        <span style="font-weight: bold;">Date:</span>
                        <span>${this.formatLocalDate(date)}</span>
                    </div>
                    ${this.currentOrder.customer_name ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                            <span style="font-weight: bold;">Customer:</span>
                            <span>${this.currentOrder.customer_name}</span>
                        </div>
                    ` : ''}
                    ${this.currentOrder.customer_phone ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.6;">
                            <span style="font-weight: bold;">Phone:</span>
                            <span>${this.currentOrder.customer_phone}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div style="border-top: 1px solid #000; margin: 25px 0; width: 100%;"></div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace;">
                    ${(this.currentOrder.items || []).map(item => `
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; line-height: 1.6; font-size: 14px;">
                                <span style="font-weight: normal;">${item.name}</span>
                                <span style="font-weight: normal; text-align: right;">${this.settings.currencySymbol || '$'}${parseFloat(item.total_price).toFixed(2)}</span>
                            </div>
                            <div style="font-size: 13px; margin-left: 0; line-height: 1.4; color: #333;">
                                ${this.settings.currencySymbol || '$'}${parseFloat(item.unit_price).toFixed(2)} x ${item.quantity}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="border-top: 1px solid #000; margin: 25px 0; width: 100%;"></div>
                
                <div style="margin-bottom: 25px; font-family: 'Courier New', monospace; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px; line-height: 1.8;">
                        <span>Subtotal:</span>
                        <span style="text-align: right;">${this.settings.currencySymbol || '$'}${subtotal.toFixed(2)}</span>
                    </div>
                    ${parseFloat(this.currentOrder.tax_amount || 0) > 0 ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; line-height: 1.8;">
                            <span>Tax (${this.settings.taxRate || '10'}%):</span>
                            <span style="text-align: right;">${this.settings.currencySymbol || '$'}${parseFloat(this.currentOrder.tax_amount || 0).toFixed(2)}</span>
                        </div>
                    ` : ''}
                    <div style="border-top: 2px solid #000; margin: 15px 0; width: 100%;"></div>
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; line-height: 2; margin-top: 10px;">
                        <span>TOTAL:</span>
                        <span style="text-align: right;">${this.settings.currencySymbol || '$'}${parseFloat(this.currentOrder.total_amount).toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 40px; font-family: 'Courier New', monospace;">
                    <p style="font-weight: normal; margin: 20px 0 10px 0; font-size: 14px; line-height: 1.6;">Thank you for your business!</p>
                    <p style="font-size: 13px; margin: 0; line-height: 1.6;">Please keep this receipt for your records.</p>
                </div>
            </div>
        `;

        // Create print window with the same styles
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        const receiptContent = tempDiv.querySelector('#tempOrderReceipt');
        
        if (receiptContent) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Receipt - ${this.currentOrder.order_number}</title>
                    <style>
                        body {
                            font-family: 'Courier New', Courier, monospace;
                            margin: 20px;
                            line-height: 1.5;
                            font-size: 14px;
                        }
                        .receipt {
                            max-width: 400px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .text-center { text-align: center; }
                        
                        /* Header Styles */
                        .receipt-title {
                            font-size: 16px;
                            font-weight: bold;
                            margin: 0 0 8px 0;
                            letter-spacing: 1px;
                        }
                        .receipt-subtitle {
                            font-size: 14px;
                            margin: 0 0 20px 0;
                        }
                        
                        /* Line Styles */
                        .receipt-line {
                            border-top: 1px solid #000;
                            margin: 15px 0;
                        }
                        .receipt-line-thick {
                            border-top: 2px solid #000;
                            margin: 10px 0;
                        }
                        
                        /* Info and Row Styles */
                        .receipt-row, .receipt-total-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 4px;
                        }
                        .receipt-label {
                            font-weight: normal;
                        }
                        .receipt-value {
                            font-weight: normal;
                        }
                        .receipt-label-bold {
                            font-weight: bold;
                            font-size: 16px;
                        }
                        .receipt-value-bold {
                            font-weight: bold;
                            font-size: 16px;
                        }
                        
                        /* Item Styles */
                        .receipt-item-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 2px;
                        }
                        .receipt-item-name {
                            font-weight: normal;
                        }
                        .receipt-item-price {
                            font-weight: normal;
                        }
                        .receipt-item-details {
                            font-size: 12px;
                            margin-bottom: 8px;
                            margin-left: 0;
                        }
                        
                        /* Footer Styles */
                        .receipt-thanks {
                            font-weight: normal;
                            margin: 20px 0 8px 0;
                        }
                        .receipt-note {
                            font-size: 12px;
                            margin: 0;
                        }
                        
                        /* Spacing */
                        .mb-3 { margin-bottom: 12px; }
                        .mb-4 { margin-bottom: 16px; }
                        .mt-4 { margin-top: 16px; }
                        .my-2 { margin: 8px 0; }
                        
                        /* Print Styles */
                        @media print {
                            body { 
                                margin: 0; 
                                font-size: 12px;
                            }
                            .receipt { 
                                max-width: none;
                                padding: 10px;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${receiptContent.outerHTML}
                </body>
                </html>
            `);
            
            printWindow.document.close();
            
            // Wait for content to load then print
            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            };
        } else {
            this.showAlert('Failed to generate receipt for printing', 'danger');
        }
    }

    // Orders functionality
    async loadOrders() {
        try {
            const orders = await ipcRenderer.invoke('get-all-orders');
            this.allOrders = orders;
            
            // Set default filter to current month
            this.setDateFilter('thisMonth');
        } catch (error) {
            console.error('Failed to load orders:', error);
            this.showAlert('Failed to load orders', 'danger');
        }
    }

    renderOrdersTable(orders) {
        const tbody = document.getElementById('ordersTable');
        
        if (orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5">
                        <div class="d-flex flex-column align-items-center justify-content-center" style="min-height: 200px;">
                            <i class="bi bi-receipt fs-1 text-secondary mb-3"></i>
                            <h6 class="text-secondary">No orders found</h6>
                            <p class="text-light mb-0">Orders will appear here after sales</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>
                    <div class="d-flex flex-column">
                        <strong class="text-primary">${order.order_number}</strong>
                        <small class="text-secondary">ID: ${order.id.substring(0, 8)}...</small>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi bi-person-circle text-secondary"></i>
                        <span>${order.customer_name || 'Walk-in Customer'}</span>
                    </div>
                </td>
                <td>
                    <span class="modern-badge badge-info">${order.item_count || 0} items</span>
                </td>
                <td>
                    <strong class="text-success">${this.settings.currencySymbol || '$'}${parseFloat(order.total_amount).toFixed(2)}</strong>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        <span>${this.formatLocalDate(order.created_at, 'MMM DD, YYYY')}</span>
                        <small class="text-secondary">${this.formatLocalDate(order.created_at, 'h:mm A')}</small>
                    </div>
                </td>
                <td>
                    <button class="btn-modern btn-sm btn-primary" 
                            onclick="app.viewOrderDetails('${order.id}')"
                            title="View Order Details">
                        <i class="bi bi-eye"></i> View
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async viewOrderDetails(orderId) {
        try {
            // Show loading state
            const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
            const title = document.getElementById('orderDetailsTitle');
            const content = document.getElementById('orderDetailsContent');
            
            title.textContent = 'Order Details';
            content.innerHTML = `
                <div class="d-flex align-items-center justify-content-center" style="min-height: 200px;">
                    <div class="loading-spinner"></div>
                    <span class="ms-2 text-secondary">Loading order details...</span>
                </div>
            `;
            
            modal.show();
            
            const order = await ipcRenderer.invoke('get-order-by-id', orderId);
            
            if (order) {
                this.displayOrderDetails(order);
            } else {
                content.innerHTML = `
                    <div class="text-center py-5">
                        <i class="bi bi-exclamation-triangle fs-1 text-warning mb-3"></i>
                        <h5 class="text-secondary">Order Not Found</h5>
                        <p class="text-light">The requested order could not be found.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Failed to load order details:', error);
            this.showAlert('Failed to load order details', 'danger');
            
            const content = document.getElementById('orderDetailsContent');
            content.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
                    <h5 class="text-secondary">Error Loading Order</h5>
                    <p class="text-light">Failed to load order details. Please try again.</p>
                </div>
            `;
        }
    }

    displayOrderDetails(order) {
        const title = document.getElementById('orderDetailsTitle');
        const content = document.getElementById('orderDetailsContent');
        
        // Store current order for printing
        this.currentOrder = order;
        
        title.textContent = `Order ${order.order_number}`;
        
        const subtotal = order.total_amount - (order.tax_amount || 0);
        
        content.innerHTML = `
            <div class="row">
                <!-- Order Information -->
                <div class="col-md-6">
                    <div class="modern-card mb-4">
                        <div class="modern-card-header">
                            <h6 class="modern-card-title">
                                <i class="bi bi-info-circle"></i>
                                Order Information
                            </h6>
                        </div>
                        <div class="modern-card-body">
                            <div class="row g-3">
                                <div class="col-sm-6">
                                    <label class="form-label text-secondary">Order Number</label>
                                    <div class="fw-bold">${order.order_number}</div>
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label text-secondary">Date & Time</label>
                                    <div class="fw-bold">${this.formatLocalDate(order.created_at)}</div>
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label text-secondary">Payment Method</label>
                                    <div class="fw-bold text-capitalize">${order.payment_method || 'cash'}</div>
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label text-secondary">Status</label>
                                    <span class="modern-badge badge-success">${order.status || 'completed'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Customer Information -->
                <div class="col-md-6">
                    <div class="modern-card mb-4">
                        <div class="modern-card-header">
                            <h6 class="modern-card-title">
                                <i class="bi bi-person"></i>
                                Customer Information
                            </h6>
                        </div>
                        <div class="modern-card-body">
                            <div class="row g-3">
                                <div class="col-12">
                                    <label class="form-label text-secondary">Customer Name</label>
                                    <div class="fw-bold">${order.customer_name || 'Walk-in Customer'}</div>
                                </div>
                                <div class="col-12">
                                    <label class="form-label text-secondary">Phone Number</label>
                                    <div class="fw-bold">${order.customer_phone || 'Not provided'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Order Items -->
            <div class="modern-card mb-4">
                <div class="modern-card-header">
                    <h6 class="modern-card-title">
                        <i class="bi bi-cart"></i>
                        Order Items
                    </h6>
                </div>
                <div class="modern-card-body p-0">
                    <div class="modern-table-container">
                        <table class="modern-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Barcode</th>
                                    <th>Quantity</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(order.items || []).map(item => `
                                    <tr>
                                        <td>
                                            <strong class="text-primary">${item.name}</strong>
                                        </td>
                                        <td>
                                            <code class="bg-light px-2 py-1 rounded text-dark">${item.barcode || '-'}</code>
                                        </td>
                                        <td>
                                            <span class="fw-bold">${item.quantity}</span>
                                        </td>
                                        <td>
                                            ${this.settings.currencySymbol || '$'}${parseFloat(item.unit_price).toFixed(2)}
                                        </td>
                                        <td>
                                            <strong class="text-success">${this.settings.currencySymbol || '$'}${parseFloat(item.total_price).toFixed(2)}</strong>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Order Summary -->
            <div class="modern-card">
                <div class="modern-card-header">
                    <h6 class="modern-card-title">
                        <i class="bi bi-calculator"></i>
                        Order Summary
                    </h6>
                </div>
                <div class="modern-card-body">
                    <div class="row justify-content-end">
                        <div class="col-md-6">
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span>Subtotal:</span>
                                <span class="fw-bold">${this.settings.currencySymbol || '$'}${subtotal.toFixed(2)}</span>
                            </div>
                            ${parseFloat(order.tax_amount || 0) > 0 ? `
                                <div class="d-flex justify-content-between py-2 border-bottom">
                                    <span>Tax:</span>
                                    <span class="fw-bold">${this.settings.currencySymbol || '$'}${parseFloat(order.tax_amount || 0).toFixed(2)}</span>
                                </div>
                            ` : ''}
                            ${order.discount_amount ? `
                                <div class="d-flex justify-content-between py-2 border-bottom">
                                    <span>Discount:</span>
                                    <span class="fw-bold text-success">-${this.settings.currencySymbol || '$'}${parseFloat(order.discount_amount).toFixed(2)}</span>
                                </div>
                            ` : ''}
                            <div class="d-flex justify-content-between py-3 border-bottom border-2">
                                <span class="fs-5 fw-bold">Total:</span>
                                <span class="fs-5 fw-bold text-success">${this.settings.currencySymbol || '$'}${parseFloat(order.total_amount).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Global search functionality
    async performGlobalSearch() {
        const searchTerm = document.getElementById('globalSearch').value.trim();
        
        if (!searchTerm) {
            this.showAlert('Please enter a search term', 'warning');
            return;
        }

        try {
            // Search in inventory items
            const items = await ipcRenderer.invoke('search-items', searchTerm);
            
            if (items.length > 0) {
                // Switch to inventory tab and show results
                this.switchTab('inventory');
                document.getElementById('searchInput').value = searchTerm;
                this.renderInventoryTable(items);
                this.showAlert(`Found ${items.length} item(s) matching "${searchTerm}"`, 'success');
            } else {
                // Try searching in orders
                const orders = await ipcRenderer.invoke('get-all-orders');
                const matchingOrders = orders.filter(order => 
                    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (order.customer_name && order.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (order.customer_phone && order.customer_phone.includes(searchTerm))
                );

                if (matchingOrders.length > 0) {
                    // Switch to orders tab and show results
                    this.switchTab('orders');
                    this.renderOrdersTable(matchingOrders);
                    this.showAlert(`Found ${matchingOrders.length} order(s) matching "${searchTerm}"`, 'success');
                } else {
                    this.showAlert(`No results found for "${searchTerm}"`, 'info');
                }
            }
        } catch (error) {
            console.error('Global search failed:', error);
            this.showAlert('Search failed. Please try again.', 'danger');
        }
    }

    // Utility functions
    showAlert(message, type = 'info') {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alertDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // Settings methods
    async initializeSettings() {
        try {
            // Initialize default settings in database
            await ipcRenderer.invoke('initialize-default-settings');
            
            // Load all settings
            this.settings = await ipcRenderer.invoke('get-all-settings');
            
            // Initialize currency displays
            this.initializeCurrencyDisplays();
            
            console.log('Settings loaded:', this.settings);
        } catch (error) {
            console.error('Failed to initialize settings:', error);
            // Set default settings if loading fails
            this.settings = {
                companyName: 'INVENTORY MANAGEMENT SYSTEM',
                trnNumber: '',
                currencyCode: '$',
                currencySymbol: '$',
                taxRate: '10',
                address: '',
                phone: '',
                email: ''
            };
            // Initialize currency displays with defaults
            this.initializeCurrencyDisplays();
        }
    }

    async loadSettings() {
        try {
            this.settings = await ipcRenderer.invoke('get-all-settings');
            this.updateSettingsForm();
            this.updateReceiptPreview();
            this.initializeCurrencyDisplays();
            this.updateAllCurrencyDisplays();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            const form = document.getElementById('settingsForm');
            const formData = new FormData(form);
            
            const settings = {
                companyName: document.getElementById('companyName').value,
                trnNumber: document.getElementById('trnNumber').value,
                currencyCode: document.getElementById('currencyCode').value,
                currencySymbol: document.getElementById('currencySymbol').value,
                taxRate: document.getElementById('taxRate').value,
                address: document.getElementById('address').value,
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value
            };

            for (const [key, value] of Object.entries(settings)) {
                await ipcRenderer.invoke('set-setting', key, value);
            }

            this.settings = settings;
            this.updateReceiptPreview();
            this.updateAllCurrencyDisplays();
            this.initializeCurrencyDisplays();
            this.showAlert('Settings saved successfully!', 'success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showAlert('Failed to save settings', 'danger');
        }
    }

    async handlePasswordChange() {
        try {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Validation
            if (!currentPassword || !newPassword || !confirmPassword) {
                this.showAlert('Please fill in all password fields', 'error');
                return;
            }

            if (newPassword.length < 6) {
                this.showAlert('New password must be at least 6 characters long', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                this.showAlert('New password and confirmation do not match', 'error');
                return;
            }

            // Verify current password and update to new password
            const updateResult = await ipcRenderer.invoke('update-user-password', this.currentUser.email, currentPassword, newPassword);
            
            if (!updateResult) {
                this.showAlert('Current password is incorrect', 'error');
                return;
            }

            // Update local user data (password hash is not stored locally for security)
            localStorage.setItem('inventory_auth', JSON.stringify({
                user: this.currentUser,
                timestamp: Date.now()
            }));

            // Clear form
            document.getElementById('passwordChangeForm').reset();

            this.showAlert('Password changed successfully!', 'success');
        } catch (error) {
            console.error('Failed to change password:', error);
            this.showAlert('Failed to change password', 'error');
        }
    }

    updateSettingsForm() {
        const fields = ['companyName', 'trnNumber', 'currencyCode', 'taxRate', 'address', 'phone', 'email'];
        
        fields.forEach(field => {
            const element = document.getElementById(field);
            if (element && this.settings[field]) {
                element.value = this.settings[field];
            }
        });

        // Update currency symbol when currency code changes
        this.updateCurrencySymbol();
    }

    updateCurrencySymbol() {
        const currencyCode = document.getElementById('currencyCode').value;
        const currencySymbol = document.getElementById('currencySymbol');
        
        if (currencySymbol) {
            currencySymbol.value = currencyCode;
        }
    }

    updateReceiptPreview() {
        const companyName = document.querySelector('.preview-company-name');
        const address = document.querySelector('.preview-address');
        const contact = document.querySelector('.preview-contact');
        const trn = document.querySelector('.preview-trn');
        const currencyElements = document.querySelectorAll('.preview-currency');

        if (companyName) companyName.textContent = this.settings.companyName || 'INVENTORY MANAGEMENT SYSTEM';
        if (address) address.textContent = this.settings.address || 'Company Address';
        if (contact) contact.textContent = `Phone: ${this.settings.phone || '000-000-0000'} | Email: ${this.settings.email || 'info@company.com'}`;
        if (trn) trn.textContent = `TRN: ${this.settings.trnNumber || '000000000000000'}`;
        
        currencyElements.forEach(el => {
            const currentText = el.textContent;
            const amount = currentText.replace(/[^\d.]/g, '');
            el.textContent = `${this.settings.currencySymbol || '$'}${amount}`;
        });
    }

    updateAllCurrencyDisplays() {
        // Update all currency displays throughout the app
        document.querySelectorAll('[data-currency]').forEach(element => {
            const amount = element.getAttribute('data-currency');
            element.textContent = `${this.settings.currencySymbol || '$'}${amount}`;
        });
    }

    formatCurrency(amount) {
        return `${this.settings.currencySymbol || '$'}${parseFloat(amount).toFixed(2)}`;
    }

    initializeCurrencyDisplays() {
        // Initialize POS cart totals with correct currency
        const subtotalEl = document.getElementById('subtotal');
        const taxEl = document.getElementById('tax');
        const totalEl = document.getElementById('total');
        
        if (subtotalEl) subtotalEl.textContent = `${this.settings.currencySymbol || '$'}0.00`;
        if (taxEl) taxEl.textContent = `${this.settings.currencySymbol || '$'}0.00`;
        if (totalEl) totalEl.textContent = `${this.settings.currencySymbol || '$'}0.00`;
        
        // Update tax label with rate
        const taxLabel = document.getElementById('taxLabel');
        const taxRow = document.getElementById('taxRow');
        const taxRate = parseFloat(this.settings.taxRate || 0);
        
        if (taxRate > 0) {
            if (taxLabel) taxLabel.textContent = `Tax (${this.settings.taxRate}%):`;
            if (taxRow) taxRow.style.display = 'flex';
        } else {
            if (taxRow) taxRow.style.display = 'none';
        }
        
        // Update item modal currency symbols
        const sellingPriceCurrency = document.getElementById('sellingPriceCurrency');
        const costPriceCurrency = document.getElementById('costPriceCurrency');
        
        if (sellingPriceCurrency) sellingPriceCurrency.textContent = this.settings.currencySymbol || '$';
        if (costPriceCurrency) costPriceCurrency.textContent = this.settings.currencySymbol || '$';
        
        // Update settings preview
        this.updateReceiptPreview();
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default values?')) {
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

            Object.keys(defaults).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.value = defaults[key];
                }
            });

            this.updateReceiptPreview();
        }
    }

    // Orders filtering methods
    setDateFilter(period) {
        const now = new Date();
        let fromDate, toDate;
        
        // Update button states
        document.querySelectorAll('[id^="filter"][id$="Btn"]').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
        
        switch (period) {
            case 'today':
                fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                document.getElementById('filterTodayBtn').classList.remove('btn-outline-primary');
                document.getElementById('filterTodayBtn').classList.add('btn-primary');
                break;
                
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                fromDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
                toDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
                document.getElementById('filterYesterdayBtn').classList.remove('btn-outline-primary');
                document.getElementById('filterYesterdayBtn').classList.add('btn-primary');
                break;
                
            case 'thisWeek':
                const dayOfWeek = now.getDay();
                const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                fromDate = new Date(now.setDate(diff));
                fromDate.setHours(0, 0, 0, 0);
                toDate = new Date();
                toDate.setHours(23, 59, 59, 999);
                document.getElementById('filterThisWeekBtn').classList.remove('btn-outline-primary');
                document.getElementById('filterThisWeekBtn').classList.add('btn-primary');
                break;
                
            case 'thisMonth':
                fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                document.getElementById('filterThisMonthBtn').classList.remove('btn-outline-primary');
                document.getElementById('filterThisMonthBtn').classList.add('btn-primary');
                break;
                
            case 'lastMonth':
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                fromDate = lastMonth;
                toDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                document.getElementById('filterLastMonthBtn').classList.remove('btn-outline-primary');
                document.getElementById('filterLastMonthBtn').classList.add('btn-primary');
                break;
        }
        
        // Set date inputs
        document.getElementById('orderDateFrom').value = this.formatDateForInput(fromDate);
        document.getElementById('orderDateTo').value = this.formatDateForInput(toDate);
        
        // Apply filter
        this.filterOrders();
    }

    formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    filterOrders() {
        const searchTerm = document.getElementById('orderSearchInput').value.toLowerCase().trim();
        const fromDate = document.getElementById('orderDateFrom').value;
        const toDate = document.getElementById('orderDateTo').value;
        
        let filtered = [...this.allOrders];
        
        // Filter by search term (order number)
        if (searchTerm) {
            filtered = filtered.filter(order => 
                order.order_number.toLowerCase().includes(searchTerm)
            );
        }
        
        // Filter by date range
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filtered = filtered.filter(order => {
                const orderDate = new Date(order.created_at);
                return orderDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filtered = filtered.filter(order => {
                const orderDate = new Date(order.created_at);
                return orderDate <= to;
            });
        }
        
        this.filteredOrders = filtered;
        this.renderOrdersTable(filtered);
        this.updateOrdersCount(filtered.length);
        this.updateDateRangeDisplay(fromDate, toDate);
    }

    clearOrderFilters() {
        document.getElementById('orderSearchInput').value = '';
        document.getElementById('orderDateFrom').value = '';
        document.getElementById('orderDateTo').value = '';
        
        // Reset button states
        document.querySelectorAll('[id^="filter"][id$="Btn"]').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
        
        this.filteredOrders = [...this.allOrders];
        this.renderOrdersTable(this.allOrders);
        this.updateOrdersCount(this.allOrders.length);
        this.updateDateRangeDisplay('', '');
    }

    updateOrdersCount(count) {
        const ordersCount = document.getElementById('ordersCount');
        if (ordersCount) {
            ordersCount.textContent = count;
        }
    }

    updateDateRangeDisplay(fromDate, toDate) {
        const ordersDateRange = document.getElementById('ordersDateRange');
        if (ordersDateRange) {
            if (fromDate && toDate) {
                const from = this.formatLocalDate(fromDate, 'MMM DD, YYYY');
                const to = this.formatLocalDate(toDate, 'MMM DD, YYYY');
                ordersDateRange.textContent = `${from} - ${to}`;
            } else {
                ordersDateRange.textContent = '';
            }
        }
    }

    // Utility function to format dates consistently with local timezone
    formatLocalDate(dateString, format = 'MMM DD, YYYY h:mm A') {
        if (!dateString) return '';
        
        try {
            // Since SQLite stores timestamps in UTC, we need to explicitly parse as UTC first
            // then convert to local timezone
            let momentObj;
            
            // Check if the date string has timezone info
            if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
                // Date has timezone info, parse normally
                momentObj = moment(dateString);
            } else {
                // Date doesn't have timezone info, assume it's UTC (from SQLite)
                momentObj = moment.utc(dateString);
            }
            
            // Convert to local timezone
            momentObj = momentObj.local();
            
            // Format the date
            return momentObj.format(format);
        } catch (error) {
            console.error('Error formatting date:', error, 'Date string:', dateString);
            return dateString;
        }
    }

    // Add Stock Tab Methods
    async loadStockItems() {
        try {
            const items = await ipcRenderer.invoke('get-all-items');
            this.allItems = items;
            this.filteredItems = [...items];
            this.renderStockItemsTable(items);
        } catch (error) {
            console.error('Failed to load items for stock update:', error);
            this.showAlert('Failed to load items', 'danger');
        }
    }

    renderStockItemsTable(items) {
        const tbody = document.getElementById('stockItemsTable');
        
        // Update items count
        this.updateStockItemsCount(items.length);
        
        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <div class="text-secondary">
                            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                            <div class="fw-medium">No items found</div>
                            <small>Try adjusting your search criteria</small>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(item => `
            <tr class="stock-item-row">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input stock-item-checkbox" 
                           data-item-id="${item.id}" value="${item.id}">
                </td>
                <td>
                    <span class="text-muted">${item.barcode || '-'}</span>
                </td>
                <td>
                    <div class="fw-medium">${item.name}</div>
                    ${item.description ? `<small class="text-muted">${item.description}</small>` : ''}
                </td>
                <td>
                    <span class="badge bg-light text-dark">${item.category || 'Uncategorized'}</span>
                </td>
                <td class="text-center">
                    <span class="badge bg-info fs-6">${item.quantity}</span>
                </td>
                <td class="text-center">
                    <input type="number" class="form-control form-control-sm stock-quantity-input" 
                           data-item-id="${item.id}" min="0" placeholder="0" 
                           style="width: 80px; margin: 0 auto;">
                </td>
                <td class="text-center">
                    <span class="badge bg-success new-total" data-item-id="${item.id}">${item.quantity}</span>
                </td>
            </tr>
        `).join('');

        // Add event listeners for quantity inputs
        document.querySelectorAll('.stock-quantity-input').forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateNewTotal(e.target);
            });
        });
    }

    updateNewTotal(input) {
        const itemId = input.dataset.itemId;
        const addQuantity = parseInt(input.value) || 0;
        const item = this.allItems.find(i => i.id === itemId);
        
        if (item) {
            const newTotal = item.quantity + addQuantity;
            const newTotalElement = document.querySelector(`.new-total[data-item-id="${itemId}"]`);
            if (newTotalElement) {
                newTotalElement.textContent = newTotal;
                
                // Update badge color based on whether quantity is being added
                if (addQuantity > 0) {
                    newTotalElement.className = 'badge bg-success new-total';
                } else {
                    newTotalElement.className = 'badge bg-info new-total';
                }
            }
        }
    }

    updateStockItemsCount(count) {
        const stockItemsCount = document.getElementById('stockItemsCount');
        if (stockItemsCount) {
            stockItemsCount.textContent = count;
        }
    }

    filterStockItems() {
        const searchTerm = document.getElementById('stockSearchInput').value.toLowerCase().trim();
        
        if (!searchTerm) {
            this.filteredItems = [...this.allItems];
        } else {
            this.filteredItems = this.allItems.filter(item => 
                item.name.toLowerCase().includes(searchTerm) ||
                (item.barcode && item.barcode.toLowerCase().includes(searchTerm)) ||
                (item.category && item.category.toLowerCase().includes(searchTerm))
            );
        }
        
        this.renderStockItemsTable(this.filteredItems);
    }

    toggleAllStockItems(checked) {
        document.querySelectorAll('.stock-item-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    async addStockToSelectedItems() {
        const selectedItems = [];
        
        document.querySelectorAll('.stock-item-checkbox:checked').forEach(checkbox => {
            const itemId = checkbox.dataset.itemId;
            const quantityInput = document.querySelector(`.stock-quantity-input[data-item-id="${itemId}"]`);
            const addQuantity = parseInt(quantityInput.value) || 0;
            
            if (addQuantity > 0) {
                const item = this.allItems.find(i => i.id === itemId);
                if (item) {
                    selectedItems.push({
                        item,
                        addQuantity
                    });
                }
            }
        });

        if (selectedItems.length === 0) {
            this.showAlert('Please select items and enter quantities to add', 'warning');
            return;
        }

        try {
            for (const { item, addQuantity } of selectedItems) {
                const previousStock = item.quantity;
                const newStock = previousStock + addQuantity;
                
                // Update item stock in database
                await ipcRenderer.invoke('update-item-stock', item.id, newStock);
                
                // Create stock history record
                await ipcRenderer.invoke('add-stock-history', 
                    item.id, 
                    item.name, 
                    item.barcode, 
                    'in', 
                    addQuantity, 
                    previousStock, 
                    newStock, 
                    'Manual Stock Addition'
                );
            }
            
            this.showAlert(`Stock added successfully to ${selectedItems.length} item(s)`, 'success');
            this.clearStockForm();
            await this.loadStockItems(); // Refresh the table
            
        } catch (error) {
            console.error('Failed to add stock:', error);
            this.showAlert('Failed to add stock: ' + error.message, 'danger');
        }
    }

    clearStockForm() {
        document.getElementById('stockSearchInput').value = '';
        document.getElementById('selectAllStockItems').checked = false;
        document.querySelectorAll('.stock-item-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.querySelectorAll('.stock-quantity-input').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('.new-total').forEach(span => {
            const itemId = span.dataset.itemId;
            const item = this.allItems.find(i => i.id === itemId);
            if (item) {
                span.textContent = item.quantity;
                span.className = 'badge bg-info new-total'; // Reset to original color
            }
        });
    }

    // Inventory History Tab Methods
    async loadInventoryHistory() {
        try {
            const history = await ipcRenderer.invoke('get-stock-history', {});
            this.allHistory = history;
            this.filteredHistory = [...history];
            this.renderInventoryHistoryTable(history);
            this.updateHistoryCount(history.length);
        } catch (error) {
            console.error('Failed to load inventory history:', error);
            this.showAlert('Failed to load inventory history', 'danger');
        }
    }

    renderInventoryHistoryTable(history) {
        const tbody = document.getElementById('inventoryHistoryTable');
        
        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5">
                        <div class="text-secondary">
                            <i class="bi bi-clock-history fs-1 d-block mb-3"></i>
                            No inventory history found
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = history.map(record => {
            const localDate = this.formatLocalDate(record.created_at);
            const typeBadge = record.type === 'in' ? 
                '<span class="badge bg-success stock-type-badge"><i class="bi bi-arrow-down-circle me-1"></i>Stock In</span>' : 
                '<span class="badge bg-danger stock-type-badge"><i class="bi bi-arrow-up-circle me-1"></i>Stock Out</span>';
            
            const quantityBadge = record.type === 'in' ? 
                `<span class="badge bg-success quantity-badge"><i class="bi bi-plus-circle me-1"></i>+${record.quantity || 0}</span>` :
                `<span class="badge bg-danger quantity-badge"><i class="bi bi-dash-circle me-1"></i>-${record.quantity || 0}</span>`;
            
            return `
                <tr class="history-row">
                    <td>
                        <div class="history-date">
                            <div class="fw-medium text-primary">${localDate}</div>
                        </div>
                    </td>
                    <td>
                        <div class="history-item">
                            <div class="fw-medium">${record.item_name}</div>
                        </div>
                    </td>
                    <td>
                        <span class="text-muted font-monospace">${record.barcode || '-'}</span>
                    </td>
                    <td class="text-center">
                        ${typeBadge}
                    </td>
                    <td class="text-center">
                        ${quantityBadge}
                    </td>
                    <td class="text-center">
                        <span class="stock-number previous-stock">${record.previous_stock || 0}</span>
                    </td>
                    <td class="text-center">
                        <span class="stock-number new-stock">${record.new_stock || 0}</span>
                    </td>
                    <td>
                        <div class="history-reference">
                            ${record.reference ? `<span class="text-muted small">${record.reference}</span>` : '<span class="text-muted">-</span>'}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async filterHistory() {
        const searchTerm = document.getElementById('historySearchInput').value.toLowerCase().trim();
        const typeFilter = document.getElementById('historyTypeFilter').value;
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;
        
        const filters = {};
        
        if (searchTerm) {
            filters.itemName = searchTerm;
        }
        
        if (typeFilter) {
            filters.type = typeFilter;
        }
        
        if (dateFrom) {
            filters.dateFrom = dateFrom + ' 00:00:00';
        }
        
        if (dateTo) {
            filters.dateTo = dateTo + ' 23:59:59';
        }
        
        try {
            const history = await ipcRenderer.invoke('get-stock-history', filters);
            this.filteredHistory = history;
            this.renderInventoryHistoryTable(history);
            this.updateHistoryCount(history.length);
            this.updateHistoryDateRange(dateFrom, dateTo);
        } catch (error) {
            console.error('Failed to filter history:', error);
            this.showAlert('Failed to filter history', 'danger');
        }
    }

    clearHistoryFilters() {
        document.getElementById('historySearchInput').value = '';
        document.getElementById('historyTypeFilter').value = '';
        document.getElementById('historyDateFrom').value = '';
        document.getElementById('historyDateTo').value = '';
        
        this.loadInventoryHistory();
    }

    updateHistoryCount(count) {
        const historyCount = document.getElementById('historyCount');
        if (historyCount) {
            historyCount.textContent = count;
        }
    }

    updateHistoryDateRange(dateFrom, dateTo) {
        const historyDateRange = document.getElementById('historyDateRange');
        if (historyDateRange) {
            if (dateFrom && dateTo) {
                const from = this.formatLocalDate(dateFrom, 'MMM DD, YYYY');
                const to = this.formatLocalDate(dateTo, 'MMM DD, YYYY');
                historyDateRange.textContent = `${from} - ${to}`;
            } else {
                historyDateRange.textContent = '';
            }
        }
    }
}

// Initialize the application
const app = new InventoryApp();
