# Inventory Management System

A comprehensive inventory management system built with Electron.js and Node.js v20. This application provides complete inventory tracking, barcode scanning, point-of-sale functionality, and receipt generation.

## Features

### 📦 Inventory Management
- ✅ Add, edit, and delete inventory items
- ✅ Track item details (name, description, barcode, category, price, cost, quantity)
- ✅ Set minimum stock levels with low stock alerts
- ✅ Search and filter items by name, barcode, category
- ✅ Supplier information tracking

### 🛒 Point of Sale (POS)
- ✅ Barcode scanning with camera support
- ✅ Manual barcode entry
- ✅ Shopping cart functionality
- ✅ Customer information capture
- ✅ Real-time inventory updates
- ✅ Tax calculation (10%)

### 🧾 Receipt Generation
- ✅ Professional receipt formatting
- ✅ Print functionality
- ✅ Order number generation
- ✅ Customer and transaction details

### 📊 Dashboard & Analytics
- ✅ Total items overview
- ✅ Total inventory value
- ✅ Low stock alerts
- ✅ Daily sales tracking
- ✅ Recent orders display

### 📋 Order Management
- ✅ Complete order history
- ✅ Order details and item breakdown
- ✅ Customer information tracking
- ✅ Transaction timestamps

## Technical Stack

- **Framework**: Electron.js
- **Runtime**: Node.js v20+
- **Database**: SQLite3
- **Frontend**: HTML5, CSS3, Bootstrap 5
- **Barcode Scanning**: html5-qrcode
- **PDF Generation**: jsPDF
- **Icons**: Bootstrap Icons

## Installation & Setup

### Prerequisites
- Node.js v20 or higher
- npm or yarn package manager

### Installation Steps

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd inventory-management
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the application**
   ```bash
   npm start
   ```

4. **For development with DevTools**
   ```bash
   npm run dev
   ```

## Project Structure

```
inventory-management/
├── src/
│   ├── main.js                 # Main Electron process
│   ├── database/
│   │   └── database.js         # SQLite database handler
│   └── renderer/
│       ├── index.html          # Main UI
│       ├── js/
│       │   └── app.js          # Frontend application logic
│       └── styles/
│           └── main.css        # Custom styles
├── data/                       # SQLite database storage
├── package.json               # Project configuration
└── README.md                  # This file
```

## Usage Guide

### 1. Dashboard
- View overall system statistics
- Monitor low stock items
- Track daily sales and recent orders

### 2. Inventory Management
- **Add Items**: Click "Add New Item" button
- **Edit Items**: Click the pencil icon in the Actions column
- **Delete Items**: Click the trash icon (with confirmation)
- **Search**: Use the search bar to find items by name, barcode, or category

### 3. Point of Sale
- **Barcode Scanning**: 
  - Click "Camera Scan" to use device camera
  - Or manually enter barcode in the input field
- **Add to Cart**: Select quantity and click "Add to Cart"
- **Checkout**: Fill customer details (optional) and click "Complete Sale"
- **Receipt**: Automatically generated and can be printed

### 4. Order History
- View all completed transactions
- Access order details and customer information

## Database Schema

### Items Table
- `id` (TEXT, Primary Key)
- `name` (TEXT, Required)
- `description` (TEXT)
- `barcode` (TEXT, Unique)
- `category` (TEXT)
- `price` (REAL, Required)
- `cost` (REAL)
- `quantity` (INTEGER, Required)
- `min_stock` (INTEGER, Default: 10)
- `supplier` (TEXT)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Orders Table
- `id` (TEXT, Primary Key)
- `order_number` (TEXT, Unique)
- `customer_name` (TEXT)
- `customer_phone` (TEXT)
- `total_amount` (REAL, Required)
- `tax_amount` (REAL)
- `discount_amount` (REAL)
- `payment_method` (TEXT)
- `status` (TEXT)
- `created_at` (DATETIME)

### Order Items Table
- `id` (TEXT, Primary Key)
- `order_id` (TEXT, Foreign Key)
- `item_id` (TEXT, Foreign Key)
- `quantity` (INTEGER, Required)
- `unit_price` (REAL, Required)
- `total_price` (REAL, Required)

## Sample Data

The application comes with sample inventory items:
- Coca Cola 500ml (Barcode: 1234567890123)
- Bread Loaf (Barcode: 2345678901234)
- Milk 1L (Barcode: 3456789012345)

## Keyboard Shortcuts

- `Ctrl+N` (or `Cmd+N` on Mac): Add new item
- `Enter` in search fields: Execute search
- `Enter` in barcode field: Search by barcode

## Building for Distribution

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Create installer**
   ```bash
   npm run dist
   ```

The built application will be available in the `dist/` directory.

## Troubleshooting

### Camera Not Working
- Ensure camera permissions are granted
- Check if camera is being used by another application
- Try refreshing the application

### Database Issues
- The database file is created automatically in the `data/` directory
- If issues persist, delete the `data/` folder and restart the application

### Performance Issues
- Large inventory databases may require indexing optimization
- Consider implementing pagination for very large datasets

## License

This project is licensed under the MIT License.

## Support

For support and feature requests, please create an issue in the project repository.

---

**Note**: This application is designed for small to medium-sized retail operations. For enterprise-level requirements, additional features and optimizations may be needed.
