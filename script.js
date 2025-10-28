// سیستم مدیریت چندین فروشگاه - نسخه ابری با Supabase
        (function() {
            'use strict';
            
            // تنظیمات Supabase
            const SUPABASE_CONFIG = {
                url: 'https://atichswkxinwqewtpvkr.supabase.co',
                anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aWNoc3dreGlud3Fld3RwdmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODA2NjAsImV4cCI6MjA3NzE1NjY2MH0.UmJ7mQt4bmwIpvlrnp7J1TigQ8JqB09w_0OgcIVCtFA'
            };
            
            // تنظیمات سیستم
            const SYSTEM_CONFIG = {
                adminPhone: '0796304080',
                telegramBotToken: '8207227177:AAEp7JifbIQUCWYscaOxokpvdvTxat7EbQ8',
                telegramChatId: '8106254967',
                version: '2.0.0'
            };
            
            // مدیریت وضعیت سیستم
            const SystemState = {
                currentUser: null,
                isAdmin: false,
                users: [],
                pendingApprovals: [],
                adminCredentials: { email: 'admin@example.com', password: 'admin123' },
                supabase: null,
                
                async init() {
                    try {
                        // ایجاد کلاینت Supabase
                        this.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
                        
                        // تست اتصال به Supabase
                        const { data, error } = await this.supabase.from('stores').select('*').limit(1);
                        if (error) {
                            console.warn('اتصال به Supabase ناموفق:', error);
                            this.showNotification('خطا در اتصال به سرور. لطفا بعدا تلاش کنید.', 'error');
                            return;
                        }
                        
                        await this.loadFromCloud();
                        this.setupEventListeners();
                        this.showAppropriatePage();
                    } catch (error) {
                        console.error('خطا در مقداردهی اولیه سیستم:', error);
                        this.showNotification('خطا در راه‌اندازی سیستم', 'error');
                    }
                },
                
                async loadFromCloud() {
                    try {
                        // بارگذاری تمام کاربران از Supabase
                        const { data: users, error } = await this.supabase
                            .from('stores')
                            .select('*');
                        
                        if (error) throw error;
                        
                        console.log('داده‌های بارگذاری شده از Supabase:', users);
                        
                        // تفکیک کاربران تأیید شده و در انتظار تأیید
                        this.users = users.filter(user => user.approved) || [];
                        this.pendingApprovals = users.filter(user => !user.approved) || [];
                        
                        // ایجاد کاربر پیشفرض اگر هیچ کاربری وجود ندارد
                        if (this.users.length === 0 && this.pendingApprovals.length === 0) {
                            await this.createDefaultUser();
                        }
                    } catch (error) {
                        console.error('خطا در بارگذاری داده ها از ابر:', error);
                        throw error;
                    }
                },
                
                async createDefaultUser() {
                    const defaultUser = {
                        store_name: "فروشگاه نمونه",
                        owner_name: "مدیر نمونه",
                        email: "store@example.com",
                        password: "123456",
                        approved: true,
                        telegram_bot_token: "",
                        telegram_chat_id: "",
                        products: [
                            { id: 1, name: "گوشی موبایل سامسونگ", category: "1", price: 8500000, parent: null, description: "گوشی موبایل سری سامسونگ", isSold: false },
                            { id: 2, name: "مدل Galaxy S21", category: "1", price: 10200000, parent: 1, description: "گوشی پرچمدار سری گلکسی", isSold: false },
                            { id: 3, name: "مدل Galaxy A52", category: "1", price: 6800000, parent: 1, description: "گوشی میانرده سری A", isSold: false },
                            { id: 4, name: "برنج ایرانی", category: "2", price: 150000, parent: null, description: "برنج مرغوب ایرانی", isSold: false },
                            { id: 5, name: "روغن نباتی", category: "2", price: 80000, parent: null, description: "روغن نباتی مخصوص پخت و پز", isSold: false },
                            { id: 6, name: "زعفران", category: "3", price: 250000, parent: null, description: "زعفران اصل", isSold: false }
                        ],
                        categories: [
                            { id: 1, name: "الکترونیک", parent: null, productCount: 3 },
                            { id: 2, name: "مواد غذایی", parent: null, productCount: 2 },
                            { id: 3, name: "ادویه جات", parent: null, productCount: 1 },
                            { id: 4, name: "لوازم خانگی", parent: null, productCount: 0 },
                            { id: 5, name: "پوشاک", parent: null, productCount: 0 },
                            { id: 6, name: "موبایل و تبلت", parent: 1, productCount: 3 },
                            { id: 7, name: "لپ تاپ", parent: 1, productCount: 0 }
                        ],
                        sold_items: []
                    };
                    
                    const { data, error } = await this.supabase
                        .from('stores')
                        .insert([defaultUser])
                        .select();
                    
                    if (!error && data && data.length > 0) {
                        this.users.push(data[0]);
                        console.log('کاربر پیشفرض ایجاد شد:', data[0]);
                    } else {
                        console.error('خطا در ایجاد کاربر پیشفرض:', error);
                    }
                },
                
                async saveUserToCloud(user) {
                    try {
                        if (!user.id) {
                            // کاربر جدید - درج
                            const { data, error } = await this.supabase
                                .from('stores')
                                .insert([user])
                                .select();
                            
                            if (error) throw error;
                            
                            if (data && data.length > 0) {
                                return data[0];
                            }
                        } else {
                            // کاربر موجود - به‌روزرسانی
                            const { error } = await this.supabase
                                .from('stores')
                                .update(user)
                                .eq('id', user.id);
                            
                            if (error) throw error;
                            
                            return user;
                        }
                    } catch (error) {
                        console.error('خطا در ذخیره کاربر در ابر:', error);
                        throw error;
                    }
                },
                
                setupEventListeners() {
                    // مدیریت تبهای ورود
                    document.getElementById('userLoginTab').addEventListener('click', () => this.switchLoginTab('user'));
                    document.getElementById('adminLoginTab').addEventListener('click', () => this.switchLoginTab('admin'));
                    
                    // فرمهای ورود
                    document.getElementById('userLoginForm').addEventListener('submit', (e) => this.handleUserLogin(e));
                    document.getElementById('adminLoginForm').addEventListener('submit', (e) => this.handleAdminLogin(e));
                    
                    // فرم ثبتنام
                    document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
                    
                    // دکمههای ناوبری
                    document.getElementById('showRegisterForm').addEventListener('click', () => this.showRegisterPage());
                    document.getElementById('backToLogin').addEventListener('click', () => this.showLoginPage());
                    
                    // دکمههای خروج
                    document.getElementById('userLogout').addEventListener('click', () => this.logout());
                    document.getElementById('adminLogout').addEventListener('click', () => this.logout());
                    
                    // فرمهای مدیریت محصولات و دسته بندی ها
                    document.getElementById('productForm').addEventListener('submit', (e) => this.handleAddProduct(e));
                    document.getElementById('categoryForm').addEventListener('submit', (e) => this.handleAddCategory(e));
                    document.getElementById('editProductForm').addEventListener('submit', (e) => this.handleEditProduct(e));
                    
                    // دکمههای فروش
                    document.getElementById('markAsSold').addEventListener('click', () => this.markProductsAsSold());
                    
                    // دکمههای پشتیبانگیری
                    document.getElementById('backupData').addEventListener('click', () => this.backupData());
                    document.getElementById('restoreData').addEventListener('click', () => this.triggerRestore());
                    document.getElementById('clearData').addEventListener('click', () => this.clearData());
                    document.getElementById('restoreFile').addEventListener('change', (e) => this.restoreData(e));
                    
                    // دکمههای پرینت
                    document.getElementById('printProducts').addEventListener('click', () => this.printProducts());
                    document.getElementById('printCategories').addEventListener('click', () => this.printCategories());
                    document.getElementById('printSales').addEventListener('click', () => this.printSales());
                    document.getElementById('printInventory').addEventListener('click', () => this.printInventory());
                    
                    // تنظیمات تلگرام
                    document.getElementById('saveTelegramSettings').addEventListener('click', () => this.saveTelegramSettings());
                    
                    // مدیریت مودالها
                    document.querySelectorAll('.close-modal').forEach(btn => {
                        btn.addEventListener('click', () => this.closeAllModals());
                    });
                    
                    // مدیریت پنل ادمین
                    document.getElementById('createStoreAccount').addEventListener('click', () => this.openCreateStoreModal());
                    document.getElementById('createStoreForm').addEventListener('submit', (e) => this.handleCreateStore(e));
                    document.getElementById('backupAllData').addEventListener('click', () => this.backupAllData());
                    document.getElementById('resetAllData').addEventListener('click', () => this.resetAllData());
                    document.getElementById('viewAllData').addEventListener('click', () => this.viewAllData());
                    
                    // دکمه خروجی محصولات
                    document.getElementById('exportProducts').addEventListener('click', () => this.exportProducts());
                    
                    // مدیریت تبهای کاربر و ادمین
                    document.querySelectorAll('#userDashboard .tab').forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const tabName = e.target.getAttribute('data-tab');
                            this.switchUserTab(tabName);
                        });
                    });
                    
                    document.querySelectorAll('#adminDashboard .tab').forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const tabName = e.target.getAttribute('data-tab');
                            this.switchAdminTab(tabName);
                        });
                    });
                    
                    // کلیک خارج از مودال برای بستن
                    window.addEventListener('click', (e) => {
                        if (e.target.classList.contains('modal')) {
                            this.closeAllModals();
                        }
                    });
                },
                
                switchLoginTab(tab) {
                    const userTab = document.getElementById('userLoginTab');
                    const adminTab = document.getElementById('adminLoginTab');
                    const userForm = document.getElementById('userLoginForm');
                    const adminForm = document.getElementById('adminLoginForm');
                    
                    if (tab === 'user') {
                        userTab.classList.add('active');
                        adminTab.classList.remove('active');
                        userForm.style.display = 'block';
                        adminForm.style.display = 'none';
                    } else {
                        userTab.classList.remove('active');
                        adminTab.classList.add('active');
                        userForm.style.display = 'none';
                        adminForm.style.display = 'block';
                    }
                },
                
                showAppropriatePage() {
                    const loginPage = document.getElementById('loginPage');
                    const registerPage = document.getElementById('registerPage');
                    const userDashboard = document.getElementById('userDashboard');
                    const adminDashboard = document.getElementById('adminDashboard');
                    const userInfo = document.getElementById('userInfo');
                    const userLogout = document.getElementById('userLogout');
                    const adminLogout = document.getElementById('adminLogout');
                    
                    // مخفی کردن تمام صفحات
                    loginPage.classList.add('hidden');
                    registerPage.classList.add('hidden');
                    userDashboard.classList.add('hidden');
                    adminDashboard.classList.add('hidden');
                    userInfo.style.display = 'none';
                    
                    if (this.currentUser) {
                        userInfo.style.display = 'flex';
                        if (this.isAdmin) {
                            adminDashboard.classList.remove('hidden');
                            userLogout.style.display = 'none';
                            adminLogout.style.display = 'block';
                            this.renderAdminDashboard();
                        } else {
                            userDashboard.classList.remove('hidden');
                            userLogout.style.display = 'block';
                            adminLogout.style.display = 'none';
                            this.renderUserDashboard();
                        }
                    } else {
                        loginPage.classList.remove('hidden');
                    }
                },
                
                showLoginPage() {
                    document.getElementById('loginPage').classList.remove('hidden');
                    document.getElementById('registerPage').classList.add('hidden');
                },
                
                showRegisterPage() {
                    document.getElementById('loginPage').classList.add('hidden');
                    document.getElementById('registerPage').classList.remove('hidden');
                },
                
                async handleUserLogin(e) {
                    e.preventDefault();
                    const email = document.getElementById('userEmail').value;
                    const password = document.getElementById('userPassword').value;
                    
                    try {
                        // جستجو در کاربران تأیید شده
                        let user = this.users.find(u => u.email === email && u.password === password && u.approved);
                        
                        if (!user) {
                            // جستجو در کاربران در انتظار تأیید
                            user = this.pendingApprovals.find(u => u.email === email && u.password === password);
                            if (user) {
                                this.currentUser = user;
                                this.isAdmin = false;
                                this.showAppropriatePage();
                                this.showNotification('حساب شما در انتظار تأیید مدیر است', 'warning');
                                return;
                            }
                        }
                        
                        if (user) {
                            this.currentUser = user;
                            this.isAdmin = false;
                            this.showAppropriatePage();
                            this.showNotification('ورود موفقیتآمیز', 'success');
                        } else {
                            this.showNotification('ایمیل یا رمز عبور اشتباه است', 'error');
                        }
                    } catch (error) {
                        console.error('خطا در ورود:', error);
                        this.showNotification('خطا در ورود به سیستم', 'error');
                    }
                },
                
                async handleAdminLogin(e) {
                    e.preventDefault();
                    const email = document.getElementById('adminEmail').value;
                    const password = document.getElementById('adminPassword').value;
                    
                    if (email === this.adminCredentials.email && password === this.adminCredentials.password) {
                        this.currentUser = { store_name: 'مدیر سیستم', owner_name: 'مدیر', email: email };
                        this.isAdmin = true;
                        this.showAppropriatePage();
                        this.showNotification('ورود مدیر موفقیتآمیز', 'success');
                    } else {
                        this.showNotification('ایمیل یا رمز عبور مدیر اشتباه است', 'error');
                    }
                },
                
                async handleRegister(e) {
                    e.preventDefault();
                    const storeName = document.getElementById('storeName').value;
                    const ownerName = document.getElementById('ownerName').value;
                    const email = document.getElementById('registerEmail').value;
                    const password = document.getElementById('registerPassword').value;
                    const confirmPassword = document.getElementById('confirmPassword').value;
                    
                    // بررسی تطابق رمز عبور
                    if (password !== confirmPassword) {
                        this.showNotification('رمز عبور و تکرار آن مطابقت ندارند', 'error');
                        return;
                    }
                    
                    // بررسی وجود ایمیل
                    if (this.users.find(u => u.email === email) || this.pendingApprovals.find(u => u.email === email)) {
                        this.showNotification('این ایمیل قبلاً ثبت نام شده است', 'error');
                        return;
                    }
                    
                    // ایجاد کاربر جدید
                    const newUser = {
                        store_name: storeName,
                        owner_name: ownerName,
                        email: email,
                        password: password,
                        approved: false,
                        telegram_bot_token: "",
                        telegram_chat_id: "",
                        products: [],
                        categories: [
                            { id: 1, name: "الکترونیک", parent: null, productCount: 0 },
                            { id: 2, name: "مواد غذایی", parent: null, productCount: 0 },
                            { id: 3, name: "ادویه جات", parent: null, productCount: 0 },
                            { id: 4, name: "لوازم خانگی", parent: null, productCount: 0 },
                            { id: 5, name: "پوشاک", parent: null, productCount: 0 }
                        ],
                        sold_items: []
                    };
                    
                    try {
                        const savedUser = await this.saveUserToCloud(newUser);
                        if (savedUser) {
                            this.pendingApprovals.push(savedUser);
                            this.showNotification('ثبت نام موفقیتآمیز. منتظر تأیید مدیر باشید', 'success');
                            this.showLoginPage();
                            
                            // ارسال پیام به مدیر
                            this.sendToAdminTelegram(
                                `🏪 درخواست ثبت نام جدید\n\n` +
                                `فروشگاه: ${storeName}\n` +
                                `صاحب: ${ownerName}\n` +
                                `ایمیل: ${email}\n` +
                                `تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n\n` +
                                `لطفا به پنل مدیریت مراجعه کنید.`
                            );
                        }
                    } catch (error) {
                        console.error('خطا در ثبت نام:', error);
                        this.showNotification('خطا در ثبت نام', 'error');
                    }
                },
                
                async handleCreateStore(e) {
                    e.preventDefault();
                    const storeName = document.getElementById('newStoreName').value;
                    const ownerName = document.getElementById('newOwnerName').value;
                    const email = document.getElementById('newStoreEmail').value;
                    const password = document.getElementById('newStorePassword').value;
                    
                    // بررسی وجود ایمیل
                    if (this.users.find(u => u.email === email) || this.pendingApprovals.find(u => u.email === email)) {
                        this.showNotification('این ایمیل قبلاً ثبت نام شده است', 'error');
                        return;
                    }
                    
                    // ایجاد کاربر جدید
                    const newUser = {
                        store_name: storeName,
                        owner_name: ownerName,
                        email: email,
                        password: password,
                        approved: true,
                        telegram_bot_token: "",
                        telegram_chat_id: "",
                        products: [],
                        categories: [
                            { id: 1, name: "الکترونیک", parent: null, productCount: 0 },
                            { id: 2, name: "مواد غذایی", parent: null, productCount: 0 },
                            { id: 3, name: "ادویه جات", parent: null, productCount: 0 },
                            { id: 4, name: "لوازم خانگی", parent: null, productCount: 0 },
                            { id: 5, name: "پوشاک", parent: null, productCount: 0 }
                        ],
                        sold_items: []
                    };
                    
                    try {
                        const savedUser = await this.saveUserToCloud(newUser);
                        if (savedUser) {
                            this.users.push(savedUser);
                            this.closeAllModals();
                            this.renderAdminDashboard();
                            
                            this.showNotification(`حساب فروشگاه ${storeName} با موفقیت ایجاد شد`, 'success');
                            
                            // ارسال پیام به مدیر
                            this.sendToAdminTelegram(
                                `✅ حساب جدید ایجاد شد\n\n` +
                                `فروشگاه: ${storeName}\n` +
                                `صاحب: ${ownerName}\n` +
                                `ایمیل: ${email}\n` +
                                `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                            );
                        }
                    } catch (error) {
                        console.error('خطا در ایجاد فروشگاه:', error);
                        this.showNotification('خطا در ایجاد فروشگاه', 'error');
                    }
                },
                
                async logout() {
                    this.currentUser = null;
                    this.isAdmin = false;
                    this.showAppropriatePage();
                    this.showNotification('خروج موفقیتآمیز', 'info');
                },
                
                renderUserDashboard() {
                    if (!this.currentUser) return;
                    
                    // بهروزرسانی اطلاعات کاربر
                    document.getElementById('userStoreName').textContent = this.currentUser.store_name;
                    document.getElementById('userName').textContent = this.currentUser.store_name;
                    document.getElementById('userAvatar').textContent = this.currentUser.store_name.charAt(0);
                    
                    // نمایش وضعیت تأیید کاربر
                    const userStatusElement = document.getElementById('userStatus');
                    const pendingApprovalElement = document.getElementById('pendingApproval');
                    const userDashboardContent = document.getElementById('userDashboardContent');
                    
                    if (this.currentUser.approved) {
                        userStatusElement.innerHTML = '<span class="user-status status-approved">تأیید شده</span>';
                        pendingApprovalElement.style.display = 'none';
                        userDashboardContent.style.display = 'block';
                        
                        // بهروزرسانی آمار
                        this.updateUserStats();
                        
                        // رندر محصولات و دسته بندی ها
                        this.renderUserProducts();
                        this.renderUserCategories();
                        this.renderUserSoldItems();
                        this.populateUserCategoryDropdowns();
                        this.populateUserParentDropdowns();
                        this.updateUserProductsChecklist();
                        
                        // بارگذاری تنظیمات تلگرام کاربر
                        if (document.getElementById('userTelegramToken')) {
                            document.getElementById('userTelegramToken').value = this.currentUser.telegram_bot_token || '';
                            document.getElementById('userTelegramChatId').value = this.currentUser.telegram_chat_id || '';
                        }
                    } else {
                        userStatusElement.innerHTML = '<span class="user-status status-pending">در انتظار تأیید</span>';
                        pendingApprovalElement.style.display = 'block';
                        userDashboardContent.style.display = 'none';
                    }
                },
                
                updateUserStats() {
                    if (!this.currentUser) return;
                    
                    document.getElementById('totalProducts').textContent = this.currentUser.products ? this.currentUser.products.length : 0;
                    document.getElementById('totalCategories').textContent = this.currentUser.categories ? this.currentUser.categories.length : 0;
                    
                    // تعداد محصولات اصلی
                    const parentProducts = this.currentUser.products ? this.currentUser.products.filter(p => p.parent === null) : [];
                    document.getElementById('totalParents').textContent = parentProducts.length;
                    
                    // تعداد فروش امروز
                    const today = new Date().toDateString();
                    const todaySales = this.currentUser.sold_items ? this.currentUser.sold_items.filter(item => 
                        new Date(item.soldAt).toDateString() === today
                    ).length : 0;
                    document.getElementById('totalSold').textContent = todaySales;
                },
                
                renderUserProducts() {
                    if (!this.currentUser) return;
                    
                    const tbody = document.getElementById('productsTableBody');
                    if (!tbody) return;
                    
                    tbody.innerHTML = '';
                    
                    // بررسی وجود محصولات
                    if (!this.currentUser.products || this.currentUser.products.length === 0) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="6" style="text-align: center; color: var(--text-light);">
                                    هیچ محصولی ثبت نشده است
                                </td>
                            </tr>
                        `;
                        return;
                    }
                    
                    const parentProducts = this.currentUser.products.filter(p => p.parent === null);
                    
                    parentProducts.forEach(product => {
                        const parentRow = document.createElement('tr');
                        parentRow.className = 'parent-item';
                        parentRow.innerHTML = `
                            <td>
                                <button class="toggle-children" data-id="${product.id}">+</button>
                                ${product.name}
                            </td>
                            <td>${this.getUserCategoryName(product.category)}</td>
                            <td>${product.price.toLocaleString('fa-IR')}</td>
                            <td>-</td>
                            <td>${product.isSold ? '<span style="color:red">فروخته شده</span>' : '<span style="color:green">موجود</span>'}</td>
                            <td class="actions">
                                <button class="btn-success" onclick="SystemState.openEditProductModal(${product.id})">ویرایش</button>
                                <button class="btn-danger" onclick="SystemState.deleteUserProduct(${product.id})">حذف</button>
                            </td>
                        `;
                        tbody.appendChild(parentRow);
                        
                        const childProducts = this.currentUser.products.filter(p => p.parent === product.id);
                        childProducts.forEach(child => {
                            const childRow = document.createElement('tr');
                            childRow.className = 'child-item hidden';
                            childRow.setAttribute('data-parent', product.id);
                            childRow.innerHTML = `
                                <td>→ ${child.name}</td>
                                <td>${this.getUserCategoryName(child.category)}</td>
                                <td>${child.price.toLocaleString('fa-IR')}</td>
                                <td>${product.name}</td>
                                <td>${child.isSold ? '<span style="color:red">فروخته شده</span>' : '<span style="color:green">موجود</span>'}</td>
                                <td class="actions">
                                    <button class="btn-success" onclick="SystemState.openEditProductModal(${child.id})">ویرایش</button>
                                    <button class="btn-danger" onclick="SystemState.deleteUserProduct(${child.id})">حذف</button>
                                </td>
                            `;
                            tbody.appendChild(childRow);
                        });
                    });
                    
                    // اضافه کردن event listener برای دکمههای toggle
                    document.querySelectorAll('.toggle-children').forEach(button => {
                        button.addEventListener('click', function() {
                            const parentId = this.getAttribute('data-id');
                            const childRows = document.querySelectorAll(`tr[data-parent="${parentId}"]`);
                            const isHidden = childRows.length > 0 && childRows[0].classList.contains('hidden');
                            
                            childRows.forEach(row => {
                                if (isHidden) {
                                    row.classList.remove('hidden');
                                } else {
                                    row.classList.add('hidden');
                                }
                            });
                            
                            this.textContent = isHidden ? '-' : '+';
                        });
                    });
                },
                
                renderUserCategories() {
                    if (!this.currentUser) return;
                    
                    const tbody = document.getElementById('categoriesTableBody');
                    if (!tbody) return;
                    
                    tbody.innerHTML = '';
                    
                    // بررسی وجود دسته‌بندی‌ها
                    if (!this.currentUser.categories || this.currentUser.categories.length === 0) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="4" style="text-align: center; color: var(--text-light);">
                                    هیچ دسته بندی ثبت نشده است
                                </td>
                            </tr>
                        `;
                        return;
                    }
                    
                    const parentCategories = this.currentUser.categories.filter(c => c.parent === null);
                    
                    parentCategories.forEach(category => {
                        const parentRow = document.createElement('tr');
                        parentRow.className = 'parent-item';
                        parentRow.innerHTML = `
                            <td>
                                <button class="toggle-children" data-id="${category.id}">+</button>
                                ${category.name}
                            </td>
                            <td>-</td>
                            <td>${category.productCount || 0}</td>
                            <td class="actions">
                                <button class="btn-success" onclick="SystemState.editUserCategory(${category.id})">ویرایش</button>
                                <button class="btn-danger" onclick="SystemState.deleteUserCategory(${category.id})">حذف</button>
                            </td>
                        `;
                        tbody.appendChild(parentRow);
                        
                        const childCategories = this.currentUser.categories.filter(c => c.parent === category.id);
                        childCategories.forEach(child => {
                            const childRow = document.createElement('tr');
                            childRow.className = 'child-item hidden';
                            childRow.setAttribute('data-parent', category.id);
                            childRow.innerHTML = `
                                <td>→ ${child.name}</td>
                                <td>${category.name}</td>
                                <td>${child.productCount || 0}</td>
                                <td class="actions">
                                    <button class="btn-success" onclick="SystemState.editUserCategory(${child.id})">ویرایش</button>
                                    <button class="btn-danger" onclick="SystemState.deleteUserCategory(${child.id})">حذف</button>
                                </td>
                            `;
                            tbody.appendChild(childRow);
                        });
                    });
                    
                    // اضافه کردن event listener برای دکمههای toggle
                    document.querySelectorAll('.toggle-children').forEach(button => {
                        button.addEventListener('click', function() {
                            const parentId = this.getAttribute('data-id');
                            const childRows = document.querySelectorAll(`tr[data-parent="${parentId}"]`);
                            const isHidden = childRows.length > 0 && childRows[0].classList.contains('hidden');
                            
                            childRows.forEach(row => {
                                if (isHidden) {
                                    row.classList.remove('hidden');
                                } else {
                                    row.classList.add('hidden');
                                }
                            });
                            
                            this.textContent = isHidden ? '-' : '+';
                        });
                    });
                },
                
                renderUserSoldItems() {
                    if (!this.currentUser) return;
                    
                    const soldItemsList = document.getElementById('soldItemsList');
                    if (!soldItemsList) return;
                    
                    soldItemsList.innerHTML = '';
                    
                    // نمایش فقط فروشهای امروز
                    const today = new Date().toDateString();
                    const todaySales = this.currentUser.sold_items ? this.currentUser.sold_items.filter(item => 
                        new Date(item.soldAt).toDateString() === today
                    ) : [];
                    
                    if (todaySales.length === 0) {
                        soldItemsList.innerHTML = '<p style="text-align: center; color: var(--text-light);">هیچ فروشی برای امروز ثبت نشده است</p>';
                        return;
                    }
                    
                    todaySales.forEach((item, index) => {
                        const soldItem = document.createElement('div');
                        soldItem.className = 'sold-item';
                        soldItem.innerHTML = `
                            <div class="sold-item-info">
                                <div class="sold-item-name">${item.productName}</div>
                                <div class="sold-item-details">
                                    قیمت: ${item.price.toLocaleString('fa-IR')} افغانی | 
                                    دسته بندی: ${this.getUserCategoryName(item.category)} |
                                    زمان: ${new Date(item.soldAt).toLocaleTimeString('fa-IR')}
                                </div>
                            </div>
                            <div class="sold-item-actions">
                                <button class="btn-warning" onclick="SystemState.returnProduct(${index})">بازگرداندن</button>
                            </div>
                        `;
                        soldItemsList.appendChild(soldItem);
                    });
                },
                
                populateUserCategoryDropdowns() {
                    if (!this.currentUser || !this.currentUser.categories) return;
                    
                    const categorySelects = [
                        document.getElementById('productCategory'),
                        document.getElementById('editProductCategory'),
                        document.getElementById('categoryParent')
                    ];
                    
                    categorySelects.forEach(select => {
                        if (select) {
                            // حفظ مقدار فعلی
                            const currentValue = select.value;
                            select.innerHTML = '<option value="">انتخاب کنید</option>';
                            
                            // اضافه کردن دسته بندی های اصلی
                            this.currentUser.categories
                                .filter(c => c.parent === null)
                                .forEach(category => {
                                    const option = document.createElement('option');
                                    option.value = category.id;
                                    option.textContent = category.name;
                                    select.appendChild(option);
                                });
                            
                            // بازگرداندن مقدار قبلی اگر هنوز وجود دارد
                            if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
                                select.value = currentValue;
                            }
                        }
                    });
                },
                
                populateUserParentDropdowns() {
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    const parentSelects = [
                        document.getElementById('productParent'),
                        document.getElementById('editProductParent')
                    ];
                    
                    parentSelects.forEach(select => {
                        if (select) {
                            // حفظ مقدار فعلی
                            const currentValue = select.value;
                            select.innerHTML = '<option value="">هیچکدام (محصول اصلی)</option>';
                            
                            // اضافه کردن محصولات اصلی
                            this.currentUser.products
                                .filter(p => p.parent === null)
                                .forEach(product => {
                                    const option = document.createElement('option');
                                    option.value = product.id;
                                    option.textContent = product.name;
                                    select.appendChild(option);
                                });
                            
                            // بازگرداندن مقدار قبلی اگر هنوز وجود دارد
                            if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
                                select.value = currentValue;
                            }
                        }
                    });
                },
                
                updateUserProductsChecklist() {
                    if (!this.currentUser) return;
                    
                    const checklist = document.getElementById('productsChecklist');
                    if (!checklist) return;
                    
                    checklist.innerHTML = '';
                    
                    const availableProducts = this.currentUser.products ? this.currentUser.products.filter(p => !p.isSold) : [];
                    
                    if (availableProducts.length === 0) {
                        checklist.innerHTML = '<p style="text-align: center; color: var(--text-light);">هیچ محصولی برای فروش موجود نیست</p>';
                        return;
                    }
                    
                    availableProducts.forEach(product => {
                        const checkboxItem = document.createElement('div');
                        checkboxItem.className = 'checkbox-item';
                        checkboxItem.innerHTML = `
                            <input type="checkbox" id="product_${product.id}" value="${product.id}">
                            <label for="product_${product.id}">
                                ${product.name} - ${product.price.toLocaleString('fa-IR')} افغانی
                                ${product.parent ? ` (فرعی)` : ''}
                            </label>
                        `;
                        checklist.appendChild(checkboxItem);
                    });
                },
                
                getUserCategoryName(categoryId) {
                    if (!this.currentUser || !this.currentUser.categories) return 'نامشخص';
                    const category = this.currentUser.categories.find(c => c.id == categoryId);
                    return category ? category.name : 'نامشخص';
                },
                
                async handleAddProduct(e) {
                    e.preventDefault();
                    if (!this.currentUser) return;
                    
                    const name = document.getElementById('productName').value;
                    const category = document.getElementById('productCategory').value;
                    const price = parseInt(document.getElementById('productPrice').value);
                    const parent = document.getElementById('productParent').value || null;
                    const description = document.getElementById('productDescription').value;
                    
                    if (!name || !category || !price) {
                        this.showNotification('لطفا تمام فیلدهای ضروری را پر کنید', 'error');
                        return;
                    }
                    
                    const newProduct = {
                        id: Date.now(),
                        name,
                        category,
                        price,
                        parent: parent ? parseInt(parent) : null,
                        description,
                        isSold: false
                    };
                    
                    if (!this.currentUser.products) {
                        this.currentUser.products = [];
                    }
                    this.currentUser.products.push(newProduct);
                    
                    // بهروزرسانی تعداد محصولات در دسته بندی
                    if (this.currentUser.categories) {
                        const categoryObj = this.currentUser.categories.find(c => c.id == category);
                        if (categoryObj) {
                            categoryObj.productCount = (categoryObj.productCount || 0) + 1;
                        }
                    }
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        document.getElementById('productForm').reset();
                        this.showNotification('محصول با موفقیت اضافه شد', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `➕ محصول جدید اضافه شد\n\n` +
                            `نام: ${name}\n` +
                            `قیمت: ${price.toLocaleString('fa-IR')} افغانی\n` +
                            `دسته بندی: ${this.getUserCategoryName(category)}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در ذخیره محصول', 'error');
                    }
                },
                
                async handleAddCategory(e) {
                    e.preventDefault();
                    if (!this.currentUser) return;
                    
                    const name = document.getElementById('categoryName').value;
                    const parent = document.getElementById('categoryParent').value || null;
                    
                    if (!name) {
                        this.showNotification('لطفا نام دسته بندی را وارد کنید', 'error');
                        return;
                    }
                    
                    const newCategory = {
                        id: Date.now(),
                        name,
                        parent: parent ? parseInt(parent) : null,
                        productCount: 0
                    };
                    
                    if (!this.currentUser.categories) {
                        this.currentUser.categories = [];
                    }
                    this.currentUser.categories.push(newCategory);
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        document.getElementById('categoryForm').reset();
                        this.showNotification('دسته بندی با موفقیت اضافه شد', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `📁 دسته بندی جدید اضافه شد\n\n` +
                            `نام: ${name}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در ذخیره دسته بندی', 'error');
                    }
                },
                
                openEditProductModal(productId) {
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    const product = this.currentUser.products.find(p => p.id === productId);
                    if (!product) return;
                    
                    document.getElementById('editProductId').value = product.id;
                    document.getElementById('editProductName').value = product.name;
                    document.getElementById('editProductCategory').value = product.category;
                    document.getElementById('editProductPrice').value = product.price;
                    document.getElementById('editProductParent').value = product.parent || '';
                    document.getElementById('editProductDescription').value = product.description || '';
                    
                    // مطمئن شویم dropdownها پر شدهاند
                    this.populateUserCategoryDropdowns();
                    this.populateUserParentDropdowns();
                    
                    document.getElementById('editProductModal').style.display = 'flex';
                },
                
                async handleEditProduct(e) {
                    e.preventDefault();
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    const productId = parseInt(document.getElementById('editProductId').value);
                    const name = document.getElementById('editProductName').value;
                    const category = document.getElementById('editProductCategory').value;
                    const price = parseInt(document.getElementById('editProductPrice').value);
                    const parent = document.getElementById('editProductParent').value || null;
                    const description = document.getElementById('editProductDescription').value;
                    
                    if (!name || !category || !price) {
                        this.showNotification('لطفا تمام فیلدهای ضروری را پر کنید', 'error');
                        return;
                    }
                    
                    const productIndex = this.currentUser.products.findIndex(p => p.id === productId);
                    if (productIndex === -1) return;
                    
                    // ذخیره وضعیت قبلی برای بهروزرسانی آمار دسته بندی
                    const oldCategory = this.currentUser.products[productIndex].category;
                    
                    // بهروزرسانی محصول
                    this.currentUser.products[productIndex] = {
                        ...this.currentUser.products[productIndex],
                        name,
                        category,
                        price,
                        parent: parent ? parseInt(parent) : null,
                        description
                    };
                    
                    // بهروزرسانی آمار دسته بندی ها
                    if (oldCategory !== category) {
                        const oldCategoryObj = this.currentUser.categories.find(c => c.id == oldCategory);
                        if (oldCategoryObj) {
                            oldCategoryObj.productCount = Math.max(0, (oldCategoryObj.productCount || 0) - 1);
                        }
                        
                        const newCategoryObj = this.currentUser.categories.find(c => c.id == category);
                        if (newCategoryObj) {
                            newCategoryObj.productCount = (newCategoryObj.productCount || 0) + 1;
                        }
                    }
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        this.closeAllModals();
                        this.showNotification('محصول با موفقیت ویرایش شد', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `✏️ محصول ویرایش شد\n\n` +
                            `نام: ${name}\n` +
                            `قیمت جدید: ${price.toLocaleString('fa-IR')} افغانی\n` +
                            `دسته بندی: ${this.getUserCategoryName(category)}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در ویرایش محصول', 'error');
                    }
                },
                
                async deleteUserProduct(productId) {
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    if (!confirm('آیا از حذف این محصول اطمینان دارید؟')) return;
                    
                    const productIndex = this.currentUser.products.findIndex(p => p.id === productId);
                    if (productIndex === -1) return;
                    
                    const product = this.currentUser.products[productIndex];
                    
                    // بهروزرسانی آمار دسته بندی
                    if (this.currentUser.categories) {
                        const categoryObj = this.currentUser.categories.find(c => c.id == product.category);
                        if (categoryObj) {
                            categoryObj.productCount = Math.max(0, (categoryObj.productCount || 0) - 1);
                        }
                    }
                    
                    // حذف محصول
                    this.currentUser.products.splice(productIndex, 1);
                    
                    // حذف محصولات فرزند اگر وجود دارند
                    this.currentUser.products = this.currentUser.products.filter(p => p.parent !== productId);
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        this.showNotification('محصول با موفقیت حذف شد', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `🗑️ محصول حذف شد\n\n` +
                            `نام: ${product.name}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در حذف محصول', 'error');
                    }
                },
                
                async deleteUserCategory(categoryId) {
                    if (!this.currentUser || !this.currentUser.categories) return;
                    
                    if (!confirm('آیا از حذف این دسته بندی اطمینان دارید؟ محصولات مرتبط نیز حذف خواهند شد.')) return;
                    
                    const categoryIndex = this.currentUser.categories.findIndex(c => c.id === categoryId);
                    if (categoryIndex === -1) return;
                    
                    const category = this.currentUser.categories[categoryIndex];
                    
                    // حذف دسته بندی
                    this.currentUser.categories.splice(categoryIndex, 1);
                    
                    // حذف دسته بندی های فرزند
                    this.currentUser.categories = this.currentUser.categories.filter(c => c.parent !== categoryId);
                    
                    // حذف محصولات مرتبط
                    if (this.currentUser.products) {
                        this.currentUser.products = this.currentUser.products.filter(p => p.category != categoryId);
                    }
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        this.showNotification('دسته بندی با موفقیت حذف شد', 'success');
                    } catch (error) {
                        this.showNotification('خطا در حذف دسته بندی', 'error');
                    }
                },
                
                async markProductsAsSold() {
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    const checkboxes = document.querySelectorAll('#productsChecklist input[type="checkbox"]:checked');
                    if (checkboxes.length === 0) {
                        this.showNotification('هیچ محصولی انتخاب نشده است', 'warning');
                        return;
                    }
                    
                    const soldProducts = [];
                    let totalAmount = 0;
                    
                    checkboxes.forEach(checkbox => {
                        const productId = parseInt(checkbox.value);
                        const productIndex = this.currentUser.products.findIndex(p => p.id === productId);
                        
                        if (productIndex !== -1) {
                            const product = this.currentUser.products[productIndex];
                            product.isSold = true;
                            
                            // اضافه کردن به لیست فروشها
                            if (!this.currentUser.sold_items) {
                                this.currentUser.sold_items = [];
                            }
                            
                            this.currentUser.sold_items.push({
                                productId: product.id,
                                productName: product.name,
                                category: product.category,
                                price: product.price,
                                soldAt: new Date().toISOString()
                            });
                            
                            soldProducts.push(product);
                            totalAmount += product.price;
                        }
                    });
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        
                        this.showNotification(
                            `${soldProducts.length} محصول با موفقیت به عنوان فروخته شده ثبت شد`,
                            'success'
                        );
                        
                        // ارسال پیام به تلگرام
                        if (soldProducts.length === 1) {
                            this.sendToUserTelegram(
                                `💰 فروش جدید ثبت شد\n\n` +
                                `محصول: ${soldProducts[0].name}\n` +
                                `قیمت: ${soldProducts[0].price.toLocaleString('fa-IR')} افغانی\n` +
                                `دسته بندی: ${this.getUserCategoryName(soldProducts[0].category)}\n` +
                                `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                            );
                        } else {
                            this.sendToUserTelegram(
                                `💰 فروش چندگانه ثبت شد\n\n` +
                                `تعداد محصولات: ${soldProducts.length}\n` +
                                `جمع مبلغ: ${totalAmount.toLocaleString('fa-IR')} افغانی\n` +
                                `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                            );
                        }
                    } catch (error) {
                        this.showNotification('خطا در ثبت فروش', 'error');
                    }
                },
                
                async returnProduct(soldItemIndex) {
                    if (!this.currentUser || !this.currentUser.sold_items) return;
                    
                    if (!confirm('آیا از بازگرداندن این محصول اطمینان دارید؟')) return;
                    
                    const soldItem = this.currentUser.sold_items[soldItemIndex];
                    
                    // بازگرداندن وضعیت محصول
                    if (this.currentUser.products) {
                        const productIndex = this.currentUser.products.findIndex(p => p.id === soldItem.productId);
                        if (productIndex !== -1) {
                            this.currentUser.products[productIndex].isSold = false;
                        }
                    }
                    
                    // حذف از لیست فروشها
                    this.currentUser.sold_items.splice(soldItemIndex, 1);
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        this.showNotification('محصول با موفقیت بازگردانده شد', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `↩️ محصول بازگردانده شد\n\n` +
                            `محصول: ${soldItem.productName}\n` +
                            `قیمت: ${soldItem.price.toLocaleString('fa-IR')} افغانی\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در بازگرداندن محصول', 'error');
                    }
                },
                
                backupData() {
                    if (!this.currentUser) return;
                    
                    const data = {
                        user: this.currentUser,
                        backupDate: new Date().toISOString(),
                        system: 'Store Management System'
                    };
                    
                    const dataStr = JSON.stringify(data, null, 2);
                    const dataBlob = new Blob([dataStr], { type: 'application/json' });
                    
                    const url = URL.createObjectURL(dataBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `backup-${this.currentUser.store_name}-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    this.showNotification('پشتیبان با موفقیت دانلود شد', 'success');
                },
                
                triggerRestore() {
                    document.getElementById('restoreFile').click();
                },
                
                async restoreData(e) {
                    if (!this.currentUser) return;
                    
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            
                            if (data.user && data.system === 'Store Management System') {
                                // جایگزینی داده های کاربر
                                this.currentUser = data.user;
                                
                                try {
                                    await this.saveUserToCloud(this.currentUser);
                                    this.renderUserDashboard();
                                    this.showNotification('دادهها با موفقیت بازیابی شدند', 'success');
                                } catch (error) {
                                    this.showNotification('خطا در ذخیره دادههای بازیابی شده', 'error');
                                }
                            } else {
                                this.showNotification('فایل پشتیبان معتبر نیست', 'error');
                            }
                        } catch (error) {
                            console.error('خطا در بازیابی داده ها:', error);
                            this.showNotification('خطا در بازیابی داده ها', 'error');
                        }
                    };
                    reader.readAsText(file);
                    
                    // ریست کردن input فایل
                    e.target.value = '';
                },
                
                async clearData() {
                    if (!this.currentUser) return;
                    
                    if (!confirm('آیا از پاک کردن تمام داده های خود اطمینان دارید؟ این عمل غیرقابل برگشت است.')) return;
                    
                    // حفظ اطلاعات پایه کاربر
                    const userBase = {
                        store_name: this.currentUser.store_name,
                        owner_name: this.currentUser.owner_name,
                        email: this.currentUser.email,
                        password: this.currentUser.password,
                        approved: this.currentUser.approved,
                        telegram_bot_token: this.currentUser.telegram_bot_token,
                        telegram_chat_id: this.currentUser.telegram_chat_id
                    };
                    
                    // ریست کردن داده ها
                    this.currentUser = {
                        ...userBase,
                        products: [],
                        categories: [
                            { id: 1, name: "الکترونیک", parent: null, productCount: 0 },
                            { id: 2, name: "مواد غذایی", parent: null, productCount: 0 },
                            { id: 3, name: "ادویه جات", parent: null, productCount: 0 },
                            { id: 4, name: "لوازم خانگی", parent: null, productCount: 0 },
                            { id: 5, name: "پوشاک", parent: null, productCount: 0 }
                        ],
                        sold_items: []
                    };
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.renderUserDashboard();
                        this.showNotification('تمامی داده ها پاک شدند', 'success');
                        
                        // ارسال پیام به تلگرام
                        this.sendToUserTelegram(
                            `🔄 داده ها بازنشانی شدند\n\n` +
                            `تمامی محصولات، دسته بندی ها و تاریخچه فروش پاک شدند.\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                    } catch (error) {
                        this.showNotification('خطا در پاک کردن دادهها', 'error');
                    }
                },
                
                printProducts() {
                    if (!this.currentUser) return;
                    
                    const printArea = document.getElementById('printArea');
                    printArea.innerHTML = '';
                    
                    let content = `
                        <div class="print-header" style="text-align: center; margin-bottom: 30px;">
                            <h2>گزارش محصولات</h2>
                            <p>فروشگاه: ${this.currentUser.store_name}</p>
                            <p>تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
                        </div>
                        <table class="print-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f8f9fa;">
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">نام محصول</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">دسته بندی</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">قیمت (افغانی)</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">وضعیت</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    if (this.currentUser.products) {
                        this.currentUser.products.forEach(product => {
                            content += `
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${product.name}</td>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${this.getUserCategoryName(product.category)}</td>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${product.price.toLocaleString('fa-IR')}</td>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${product.isSold ? 'فروخته شده' : 'موجود'}</td>
                                </tr>
                            `;
                        });
                    }
                    
                    content += `
                            </tbody>
                        </table>
                        <div class="print-footer" style="text-align: center; margin-top: 30px;">
                            <p>تعداد کل محصولات: ${this.currentUser.products ? this.currentUser.products.length : 0}</p>
                            <p>سیستم مدیریت فروشگاه - نسخه ${SYSTEM_CONFIG.version}</p>
                        </div>
                    `;
                    
                    printArea.innerHTML = content;
                    printArea.style.display = 'block';
                    window.print();
                    printArea.style.display = 'none';
                },
                
                printCategories() {
                    if (!this.currentUser) return;
                    
                    const printArea = document.getElementById('printArea');
                    printArea.innerHTML = '';
                    
                    let content = `
                        <div class="print-header" style="text-align: center; margin-bottom: 30px;">
                            <h2>گزارش دسته بندی ها</h2>
                            <p>فروشگاه: ${this.currentUser.store_name}</p>
                            <p>تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
                        </div>
                        <table class="print-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f8f9fa;">
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">نام دسته بندی</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">دسته بندی والد</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">تعداد محصولات</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    if (this.currentUser.categories) {
                        this.currentUser.categories.forEach(category => {
                            const parentName = category.parent ? 
                                this.currentUser.categories.find(c => c.id === category.parent)?.name || 'نامشخص' : 
                                '-';
                                
                            content += `
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${category.name}</td>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${parentName}</td>
                                    <td style="border: 1px solid #ddd; padding: 12px;">${category.productCount}</td>
                                </tr>
                            `;
                        });
                    }
                    
                    content += `
                            </tbody>
                        </table>
                        <div class="print-footer" style="text-align: center; margin-top: 30px;">
                            <p>تعداد کل دسته بندی ها: ${this.currentUser.categories ? this.currentUser.categories.length : 0}</p>
                            <p>سیستم مدیریت فروشگاه - نسخه ${SYSTEM_CONFIG.version}</p>
                        </div>
                    `;
                    
                    printArea.innerHTML = content;
                    printArea.style.display = 'block';
                    window.print();
                    printArea.style.display = 'none';
                },
                
                printSales() {
                    if (!this.currentUser) return;
                    
                    const printArea = document.getElementById('printArea');
                    printArea.innerHTML = '';
                    
                    // فقط فروشهای امروز
                    const today = new Date().toDateString();
                    const todaySales = this.currentUser.sold_items ? this.currentUser.sold_items.filter(item => 
                        new Date(item.soldAt).toDateString() === today
                    ) : [];
                    
                    let totalSales = 0;
                    todaySales.forEach(item => totalSales += item.price);
                    
                    let content = `
                        <div class="print-header" style="text-align: center; margin-bottom: 30px;">
                            <h2>گزارش فروش امروز</h2>
                            <p>فروشگاه: ${this.currentUser.store_name}</p>
                            <p>تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
                        </div>
                        <table class="print-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f8f9fa;">
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">نام محصول</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">دسته بندی</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">قیمت (افغانی)</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">زمان فروش</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    todaySales.forEach(item => {
                        content += `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 12px;">${item.productName}</td>
                                <td style="border: 1px solid #ddd; padding: 12px;">${this.getUserCategoryName(item.category)}</td>
                                <td style="border: 1px solid #ddd; padding: 12px;">${item.price.toLocaleString('fa-IR')}</td>
                                <td style="border: 1px solid #ddd; padding: 12px;">${new Date(item.soldAt).toLocaleTimeString('fa-IR')}</td>
                            </tr>
                        `;
                    });
                    
                    content += `
                            </tbody>
                        </table>
                        <div class="print-footer" style="text-align: center; margin-top: 30px;">
                            <p>تعداد فروش: ${todaySales.length} | جمع کل: ${totalSales.toLocaleString('fa-IR')} افغانی</p>
                            <p>سیستم مدیریت فروشگاه - نسخه ${SYSTEM_CONFIG.version}</p>
                        </div>
                    `;
                    
                    printArea.innerHTML = content;
                    printArea.style.display = 'block';
                    window.print();
                    printArea.style.display = 'none';
                },
                
                printInventory() {
                    if (!this.currentUser) return;
                    
                    const printArea = document.getElementById('printArea');
                    printArea.innerHTML = '';
                    
                    const availableProducts = this.currentUser.products ? this.currentUser.products.filter(p => !p.isSold) : [];
                    let totalValue = 0;
                    availableProducts.forEach(product => totalValue += product.price);
                    
                    let content = `
                        <div class="print-header" style="text-align: center; margin-bottom: 30px;">
                            <h2>گزارش موجودی انبار</h2>
                            <p>فروشگاه: ${this.currentUser.store_name}</p>
                            <p>تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
                        </div>
                        <table class="print-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f8f9fa;">
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">نام محصول</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">دسته بندی</th>
                                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">قیمت (افغانی)</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    availableProducts.forEach(product => {
                        content += `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 12px;">${product.name}</td>
                                <td style="border: 1px solid #ddd; padding: 12px;">${this.getUserCategoryName(product.category)}</td>
                                <td style="border: 1px solid #ddd; padding: 12px;">${product.price.toLocaleString('fa-IR')}</td>
                            </tr>
                        `;
                    });
                    
                    content += `
                            </tbody>
                        </table>
                        <div class="print-footer" style="text-align: center; margin-top: 30px;">
                            <p>تعداد محصولات موجود: ${availableProducts.length} | ارزش کل: ${totalValue.toLocaleString('fa-IR')} افغانی</p>
                            <p>سیستم مدیریت فروشگاه - نسخه ${SYSTEM_CONFIG.version}</p>
                        </div>
                    `;
                    
                    printArea.innerHTML = content;
                    printArea.style.display = 'block';
                    window.print();
                    printArea.style.display = 'none';
                },
                
                async saveTelegramSettings() {
                    if (!this.currentUser) return;
                    
                    const token = document.getElementById('userTelegramToken').value;
                    const chatId = document.getElementById('userTelegramChatId').value;
                    
                    this.currentUser.telegram_bot_token = token;
                    this.currentUser.telegram_chat_id = chatId;
                    
                    try {
                        await this.saveUserToCloud(this.currentUser);
                        this.showNotification('تنظیمات تلگرام ذخیره شد', 'success');
                        
                        // تست ارسال پیام
                        if (token && chatId) {
                            this.sendToUserTelegram('✅ تنظیمات تلگرام با موفقیت ذخیره شد. این پیام تستی است.');
                        }
                    } catch (error) {
                        this.showNotification('خطا در ذخیره تنظیمات تلگرام', 'error');
                    }
                },
                
                async sendToUserTelegram(message) {
                    if (!this.currentUser || !this.currentUser.telegram_bot_token || !this.currentUser.telegram_chat_id) {
                        this.updateTelegramStatus('تنظیمات تلگرام کاربر تعریف نشده است', 'error');
                        return false;
                    }
                    
                    try {
                        const url = `https://api.telegram.org/bot${this.currentUser.telegram_bot_token}/sendMessage`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                chat_id: this.currentUser.telegram_chat_id,
                                text: message,
                                parse_mode: 'HTML'
                            })
                        });
                        
                        const result = await response.json();
                        if (result.ok) {
                            this.updateTelegramStatus('پیام ارسال شد', 'active');
                            return true;
                        } else {
                            this.updateTelegramStatus('خطا در ارسال: ' + result.description, 'error');
                            return false;
                        }
                    } catch (error) {
                        console.error('خطا در ارسال به تلگرام:', error);
                        this.updateTelegramStatus('خطا در اتصال به تلگرام', 'error');
                        return false;
                    }
                },
                
                async sendToAdminTelegram(message) {
                    try {
                        const url = `https://api.telegram.org/bot${SYSTEM_CONFIG.telegramBotToken}/sendMessage`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                chat_id: SYSTEM_CONFIG.telegramChatId,
                                text: message,
                                parse_mode: 'HTML'
                            })
                        });
                        
                        const result = await response.json();
                        return result.ok;
                    } catch (error) {
                        console.error('خطا در ارسال به تلگرام مدیر:', error);
                        return false;
                    }
                },
                
                updateTelegramStatus(message, type = '') {
                    const statusElement = document.getElementById('telegramStatusText');
                    const statusContainer = document.getElementById('telegramStatus');
                    
                    if (statusElement && statusContainer) {
                        statusElement.textContent = message;
                        statusContainer.className = 'telegram-status';
                        if (type) {
                            statusContainer.classList.add(type);
                        }
                        
                        // بعد از 5 ثانیه وضعیت را به حالت عادی برگردان
                        setTimeout(() => {
                            statusElement.textContent = 'آماده';
                            statusContainer.className = 'telegram-status';
                        }, 5000);
                    }
                },
                
                closeAllModals() {
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.style.display = 'none';
                    });
                },
                
                switchUserTab(tabName) {
                    // مخفی کردن تمام تبها
                    document.querySelectorAll('.user-tab').forEach(tab => {
                        tab.classList.add('hidden');
                    });
                    
                    // غیرفعال کردن تمام تبها
                    document.querySelectorAll('#userDashboard .tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    // نمایش تب انتخاب شده
                    const targetTab = document.getElementById(`user${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
                    if (targetTab) {
                        targetTab.classList.remove('hidden');
                    }
                    
                    // فعال کردن تب انتخاب شده
                    const activeTab = document.querySelector(`#userDashboard .tab[data-tab="${tabName}"]`);
                    if (activeTab) {
                        activeTab.classList.add('active');
                    }
                },
                
                switchAdminTab(tabName) {
                    // مخفی کردن تمام تبها
                    document.querySelectorAll('.admin-tab').forEach(tab => {
                        tab.classList.add('hidden');
                    });
                    
                    // غیرفعال کردن تمام تبها
                    document.querySelectorAll('#adminDashboard .tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    // نمایش تب انتخاب شده
                    const targetTab = document.getElementById(`admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
                    if (targetTab) {
                        targetTab.classList.remove('hidden');
                    }
                    
                    // فعال کردن تب انتخاب شده
                    const activeTab = document.querySelector(`#adminDashboard .tab[data-tab="${tabName}"]`);
                    if (activeTab) {
                        activeTab.classList.add('active');
                    }
                },
                
                // مدیریت پنل ادمین
                renderAdminDashboard() {
                    this.updateAdminStats();
                    this.renderStoresList();
                    this.renderApprovalList();
                    this.renderUserCredentials();
                },
                
                updateAdminStats() {
                    document.getElementById('adminTotalStores').textContent = this.users.length;
                    document.getElementById('adminTotalProducts').textContent = this.users.reduce((total, user) => total + (user.products ? user.products.length : 0), 0);
                    document.getElementById('adminTotalSales').textContent = this.users.reduce((total, user) => total + (user.sold_items ? user.sold_items.length : 0), 0);
                    
                    // محاسبه فروشگاههای جدید (ایجاد شده در 7 روز گذشته)
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    const newStores = this.users.filter(user => {
                        const createdDate = user.created_at ? new Date(user.created_at) : new Date();
                        return createdDate > oneWeekAgo;
                    }).length;
                    document.getElementById('adminNewStores').textContent = newStores;
                },
                
                renderStoresList() {
                    const storesList = document.getElementById('storesList');
                    if (!storesList) return;
                    
                    storesList.innerHTML = '';
                    
                    if (this.users.length === 0) {
                        storesList.innerHTML = '<p style="text-align: center; color: var(--text-light);">هیچ فروشگاهی ثبت نام نکرده است</p>';
                        return;
                    }
                    
                    this.users.forEach(user => {
                        const storeItem = document.createElement('div');
                        storeItem.className = 'store-item';
                        storeItem.innerHTML = `
                            <div class="store-info">
                                <div class="store-name">${user.store_name}</div>
                                <div class="store-email">${user.email} - ${user.owner_name}</div>
                                <div class="store-details">
                                    محصولات: ${user.products ? user.products.length : 0} | دسته بندی ها: ${user.categories ? user.categories.length : 0} | فروش: ${user.sold_items ? user.sold_items.length : 0}
                                </div>
                            </div>
                            <div class="store-actions">
                                <button class="btn-info" onclick="SystemState.viewStoreDetails('${user.id}')">مشاهده</button>
                                <button class="btn-warning" onclick="SystemState.editStore('${user.id}')">ویرایش</button>
                                <button class="btn-danger" onclick="SystemState.deleteStore('${user.id}')">حذف</button>
                            </div>
                        `;
                        storesList.appendChild(storeItem);
                    });
                },
                
                renderApprovalList() {
                    const approvalList = document.getElementById('approvalList');
                    if (!approvalList) return;
                    
                    approvalList.innerHTML = '';
                    
                    if (this.pendingApprovals.length === 0) {
                        approvalList.innerHTML = '<p style="text-align: center; color: var(--text-light);">هیچ درخواست تأییدی در انتظار نیست</p>';
                        return;
                    }
                    
                    this.pendingApprovals.forEach((user, index) => {
                        const approvalItem = document.createElement('div');
                        approvalItem.className = 'approval-item';
                        approvalItem.innerHTML = `
                            <div class="approval-info">
                                <div class="store-name">${user.store_name}</div>
                                <div class="store-email">${user.email} - ${user.owner_name}</div>
                                <div class="store-details">
                                    تاریخ ثبتنام: ${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}
                                </div>
                            </div>
                            <div class="approval-actions">
                                <button class="btn-success" onclick="SystemState.approveUser('${user.id}')">تأیید</button>
                                <button class="btn-danger" onclick="SystemState.rejectUser('${user.id}')">رد</button>
                            </div>
                        `;
                        approvalList.appendChild(approvalItem);
                    });
                },
                
                renderUserCredentials() {
                    const userCredentialsTable = document.getElementById('userCredentialsTable');
                    if (!userCredentialsTable) return;
                    
                    userCredentialsTable.innerHTML = '';
                    
                    // نمایش کاربران تأیید شده
                    this.users.forEach(user => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${user.store_name}</td>
                            <td>${user.owner_name}</td>
                            <td>${user.email}</td>
                            <td class="password-cell">${user.password}</td>
                            <td><span class="user-status status-approved">تأیید شده</span></td>
                            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}</td>
                        `;
                        userCredentialsTable.appendChild(row);
                    });
                    
                    // نمایش کاربران در انتظار تأیید
                    this.pendingApprovals.forEach(user => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${user.store_name}</td>
                            <td>${user.owner_name}</td>
                            <td>${user.email}</td>
                            <td class="password-cell">${user.password}</td>
                            <td><span class="user-status status-pending">در انتظار تأیید</span></td>
                            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}</td>
                        `;
                        userCredentialsTable.appendChild(row);
                    });
                    
                    // اگر هیچ کاربری وجود ندارد
                    if (this.users.length === 0 && this.pendingApprovals.length === 0) {
                        userCredentialsTable.innerHTML = `
                            <tr>
                                <td colspan="6" style="text-align: center; color: var(--text-light);">
                                    هیچ کاربری ثبت نام نکرده است
                                </td>
                            </tr>
                        `;
                    }
                },
                
                async approveUser(userId) {
                    try {
                        const userIndex = this.pendingApprovals.findIndex(u => u.id == userId);
                        if (userIndex === -1) return;
                        
                        const user = this.pendingApprovals[userIndex];
                        user.approved = true;
                        
                        const { error } = await this.supabase
                            .from('stores')
                            .update({ approved: true })
                            .eq('id', userId);
                        
                        if (error) throw error;
                        
                        // بهروزرسانی لیستهای محلی
                        this.pendingApprovals.splice(userIndex, 1);
                        this.users.push(user);
                        
                        this.renderAdminDashboard();
                        
                        // ارسال پیام به مدیر
                        this.sendToAdminTelegram(
                            `✅ کاربر تأیید شد\n\n` +
                            `فروشگاه: ${user.store_name}\n` +
                            `صاحب: ${user.owner_name}\n` +
                            `ایمیل: ${user.email}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                        );
                        
                        this.showNotification(`فروشگاه ${user.store_name} با موفقیت تأیید شد`, 'success');
                    } catch (error) {
                        console.error('خطا در تأیید کاربر:', error);
                        this.showNotification('خطا در تأیید کاربر', 'error');
                    }
                },
                
                async rejectUser(userId) {
                    try {
                        const userIndex = this.pendingApprovals.findIndex(u => u.id == userId);
                        if (userIndex === -1) return;
                        
                        const user = this.pendingApprovals[userIndex];
                        
                        const { error } = await this.supabase
                            .from('stores')
                            .delete()
                            .eq('id', userId);
                        
                        if (error) throw error;
                        
                        // بهروزرسانی لیستهای محلی
                        this.pendingApprovals.splice(userIndex, 1);
                        
                        this.renderAdminDashboard();
                        this.showNotification(`درخواست ${user.store_name} رد شد`, 'error');
                    } catch (error) {
                        console.error('خطا در رد کاربر:', error);
                        this.showNotification('خطا در رد کاربر', 'error');
                    }
                },
                
                viewStoreDetails(userId) {
                    const user = this.users.find(u => u.id == userId);
                    if (user) {
                        alert(`جزئیات فروشگاه:\n\nنام: ${user.store_name}\nصاحب: ${user.owner_name}\nایمیل: ${user.email}\nمحصولات: ${user.products ? user.products.length : 0}\nدسته بندی ها: ${user.categories ? user.categories.length : 0}\nفروشها: ${user.sold_items ? user.sold_items.length : 0}`);
                    }
                },
                
                editStore(userId) {
                    const user = this.users.find(u => u.id == userId);
                    if (user) {
                        // در اینجا میتوانید یک مودال برای ویرایش اطلاعات فروشگاه ایجاد کنید
                        alert(`ویرایش اطلاعات فروشگاه ${user.store_name}\n\nاین قابلیت در نسخههای آینده اضافه خواهد شد.`);
                    }
                },
                
                async deleteStore(userId) {
                    const user = this.users.find(u => u.id == userId);
                    if (user && confirm(`آیا از حذف فروشگاه ${user.store_name} اطمینان دارید؟ تمام داده های مربوط به این فروشگاه حذف خواهند شد.`)) {
                        try {
                            const { error } = await this.supabase
                                .from('stores')
                                .delete()
                                .eq('id', userId);
                            
                            if (error) throw error;
                            
                            this.users = this.users.filter(u => u.id !== userId);
                            this.renderAdminDashboard();
                            
                            this.showNotification(`فروشگاه ${user.store_name} حذف شد`, 'success');
                        } catch (error) {
                            console.error('خطا در حذف فروشگاه:', error);
                            this.showNotification('خطا در حذف فروشگاه', 'error');
                        }
                    }
                },
                
                openCreateStoreModal() {
                    document.getElementById('createStoreModal').style.display = 'flex';
                },
                
                backupAllData() {
                    const data = {
                        users: this.users,
                        pendingApprovals: this.pendingApprovals,
                        backupDate: new Date().toISOString(),
                        system: 'Store Management System'
                    };
                    
                    const dataStr = JSON.stringify(data, null, 2);
                    const dataBlob = new Blob([dataStr], { type: 'application/json' });
                    
                    const url = URL.createObjectURL(dataBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `backup-all-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    this.showNotification('پشتیبان از تمام داده ها با موفقیت دانلود شد', 'success');
                },
                
                async resetAllData() {
                    if (confirm('آیا از بازنشانی تمام داده های سیستم اطمینان دارید؟ این عمل تمام کاربران، محصولات و تاریخچه را پاک میکند و غیرقابل برگشت است.')) {
                        try {
                            // حذف تمام دادهها از Supabase
                            const { error } = await this.supabase
                                .from('stores')
                                .delete()
                                .neq('id', 0); // حذف تمام رکوردها
                            
                            if (error) throw error;
                            
                            this.users = [];
                            this.pendingApprovals = [];
                            this.currentUser = null;
                            this.isAdmin = false;
                            await this.createDefaultUser();
                            this.showAppropriatePage();
                            
                            this.showNotification('تمامی داده های سیستم بازنشانی شدند', 'success');
                        } catch (error) {
                            console.error('خطا در بازنشانی دادهها:', error);
                            this.showNotification('خطا در بازنشانی دادهها', 'error');
                        }
                    }
                },
                
                viewAllData() {
                    const allData = {
                        users: this.users,
                        pendingApprovals: this.pendingApprovals,
                        adminCredentials: this.adminCredentials
                    };
                    
                    alert('دادههای سیستم:\n\n' + JSON.stringify(allData, null, 2));
                },
                
                showNotification(message, type = 'info') {
                    // حذف نوتیفیکیشن‌های قبلی
                    document.querySelectorAll('.notification').forEach(notification => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    });
                    
                    const notification = document.createElement('div');
                    notification.className = `notification ${type}`;
                    notification.innerHTML = `
                        <i class="ti ti-${type === 'success' ? 'circle-check' : type === 'error' ? 'alert-circle' : type === 'warning' ? 'alert-triangle' : 'info-circle'}"></i>
                        ${message}
                    `;
                    
                    document.body.appendChild(notification);
                    
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 5000);
                },
                
                exportProducts() {
                    if (!this.currentUser || !this.currentUser.products) return;
                    
                    const productsData = this.currentUser.products.map(product => ({
                        نام: product.name,
                        دستهبندی: this.getUserCategoryName(product.category),
                        قیمت: product.price,
                        وضعیت: product.isSold ? 'فروخته شده' : 'موجود',
                        والد: product.parent ? this.currentUser.products.find(p => p.id === product.parent)?.name || '' : '',
                        توضیحات: product.description || ''
                    }));
                    
                    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                        + "نام,دستهبندی,قیمت,وضعیت,محصول والد,توضیحات\n"
                        + productsData.map(row => 
                            `"${row.نام}","${row.دستهبندی}",${row.قیمت},"${row.وضعیت}","${row.والد}","${row.توضیحات}"`
                        ).join('\n');
                    
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `محصولات_${this.currentUser.store_name}_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    this.showNotification('خروجی CSV با موفقیت دانلود شد', 'success');
                },
                
                // توابع جدید برای رفع خطاها
                editUserCategory(categoryId) {
                    const category = this.currentUser.categories.find(c => c.id === categoryId);
                    if (category) {
                        const newName = prompt('نام جدید دسته بندی را وارد کنید:', category.name);
                        if (newName && newName.trim() !== '') {
                            category.name = newName.trim();
                            this.saveUserToCloud(this.currentUser);
                            this.renderUserDashboard();
                            this.showNotification('دسته بندی ویرایش شد', 'success');
                        }
                    }
                },
                
                editCategory(categoryId) {
                    this.editUserCategory(categoryId);
                }
            };
            
            // مقداردهی اولیه سیستم
            document.addEventListener('DOMContentLoaded', function() {
                SystemState.init();
            });
            
            // در معرض قرار دادن SystemState برای استفاده در onclickها
            window.SystemState = SystemState;
        })();