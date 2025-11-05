// سیستم مدیریت جامع فروشگاه ها و صرافی ها - نسخه کامل Real-Time
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
        version: '3.0.0',
        googleClientId: '627857769759-v75t79pv4f2lu946gq6aq21888hqc8ge.apps.googleusercontent.com'
    };
    
    // مدیریت وضعیت سیستم
    const SystemState = {
        currentUser: null,
        isAdmin: false,
        users: [],
        pendingApprovals: [],
        adminCredentials: { email: 'admin@example.com', password: 'admin123' },
        supabase: null,
        realtimeSubscription: null,
        businessTypes: {
            'retail': 'فروشگاه خرده فروشی',
            'wholesale': 'فروشگاه عمدهفروشی',
            'exchange': 'صرافی ارز',
            'restaurant': 'رستوران و کافه',
            'service': 'خدمات',
            'other': 'سایر'
        },
        currencies: ['USD', 'EUR', 'GBP', 'AED', 'PKR', 'IRR'],
        notifications: [],
        unreadNotifications: 0,
        
        async init() {
            try {
                // ایجاد کلاینت Supabase
                this.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
                
                // تست اتصال به Supabase
                const { data, error } = await this.supabase.from('businesses').select('*').limit(1);
                if (error) {
                    console.warn('اتصال به Supabase ناموفق:', error);
                    this.showNotification('خطا در اتصال به سرور. لطفا بعدا تلاش کنید.', 'error');
                    return;
                }
                
                await this.loadFromCloud();
                this.setupRealtimeSubscription();
                this.setupEventListeners();
                this.handlePageReload();
                this.showAppropriatePage();
                this.setupMobileMenu();
                this.setupPasswordStrength();
                this.setupGoogleAuth();
            } catch (error) {
                console.error('خطا در مقداردهی اولیه سیستم:', error);
                this.showNotification('خطا در راهاندازی سیستم', 'error');
            }
        },
        
        handlePageReload: function() {
            // بازیابی وضعیت کاربر از localStorage
            const savedSession = localStorage.getItem('userSession');
            if (savedSession) {
                try {
                    const session = JSON.parse(savedSession);
                    // بررسی اینکه آیا session هنوز معتبر است (کمتر از 24 ساعت گذشته)
                    if (Date.now() - session.timestamp < 24 * 60 * 60 * 1000) {
                        this.currentUser = session.user;
                        this.isAdmin = session.isAdmin;
                        console.log('وضعیت کاربر بازیابی شد:', this.currentUser);
                    } else {
                        localStorage.removeItem('userSession');
                    }
                } catch (e) {
                    console.error('خطا در بازیابی وضعیت کاربر:', e);
                    localStorage.removeItem('userSession');
                }
            }
            
            // جلوگیری از رفتار پیشفرض ریلود
            window.addEventListener('beforeunload', function(e) {
                // ذخیره وضعیت فعلی در localStorage
                if (SystemState.currentUser) {
                    localStorage.setItem('userSession', JSON.stringify({
                        user: SystemState.currentUser,
                        isAdmin: SystemState.isAdmin,
                        timestamp: Date.now()
                    }));
                }
            });
        },
        
        async loadFromCloud() {
            try {
                // بارگذاری تمام کاربران از Supabase
                const { data: users, error } = await this.supabase
                    .from('businesses')
                    .select('*');
                
                if (error) throw error;
                
                console.log('داده‌های بارگذاری شده از Supabase:', users);
                
                // تفکیک کاربران تأیید شده و در انتظار تأیید
                this.users = users.filter(user => user.approved) || [];
                this.pendingApprovals = users.filter(user => !user.approved) || [];
                
                // بارگذاری اطلاعیه‌ها
                this.loadNotifications();
                
                // ایجاد کاربر پیشفرض اگر هیچ کاربری وجود ندارد
                if (this.users.length === 0 && this.pendingApprovals.length === 0) {
                    await this.createDefaultUser();
                }
            } catch (error) {
                console.error('خطا در بارگذاری داده ها از ابر:', error);
                throw error;
            }
        },
        
        // ================= REAL-TIME SETUP =================
        setupRealtimeSubscription() {
            // ایجاد اشتراک Real-Time برای جدول businesses
            this.realtimeSubscription = this.supabase
                .channel('businesses-realtime')
                .on('postgres_changes', 
                    { 
                        event: '*', // تمام رویدادها (INSERT, UPDATE, DELETE)
                        schema: 'public', 
                        table: 'businesses' 
                    }, 
                    (payload) => {
                        console.log('تغییر Real-Time دریافت شد:', payload);
                        this.handleRealtimeChange(payload);
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('اشتراک Real-Time فعال شد');
                        this.updateRealtimeStatus(true);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('خطا در اشتراک Real-Time');
                        this.updateRealtimeStatus(false);
                        this.showNotification('اتصال Real-Time قطع شد', 'error');
                    }
                });
        },
        
        handleRealtimeChange(payload) {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            switch (eventType) {
                case 'INSERT':
                    this.handleNewRecord(newRecord);
                    break;
                    
                case 'UPDATE':
                    this.handleUpdatedRecord(newRecord, oldRecord);
                    break;
                    
                case 'DELETE':
                    this.handleDeletedRecord(oldRecord);
                    break;
            }
            
            // نمایش نوتیفیکیشن Real-Time
            this.showRealtimeNotification(eventType, newRecord || oldRecord);
        },
        
        handleNewRecord(record) {
            if (record.approved) {
                this.users.push(record);
            } else {
                this.pendingApprovals.push(record);
            }
            
            // به‌روزرسانی خودکار داشبوردها
            this.updateAllDisplays();
        },
        
        handleUpdatedRecord(newRecord, oldRecord) {
            if (newRecord.approved) {
                // اگر کاربر تأیید شده
                const userIndex = this.users.findIndex(u => u.id === newRecord.id);
                if (userIndex !== -1) {
                    this.users[userIndex] = newRecord;
                } else {
                    this.users.push(newRecord);
                    // حذف از لیست انتظار اگر وجود داشت
                    this.pendingApprovals = this.pendingApprovals.filter(u => u.id !== newRecord.id);
                }
            } else {
                // اگر کاربر در انتظار تأیید است
                const pendingIndex = this.pendingApprovals.findIndex(u => u.id === newRecord.id);
                if (pendingIndex !== -1) {
                    this.pendingApprovals[pendingIndex] = newRecord;
                }
            }
            
            // اگر کاربر جاری به‌روزرسانی شده
            if (this.currentUser && this.currentUser.id === newRecord.id) {
                this.currentUser = newRecord;
                this.renderUserDashboard();
            }
            
            // به‌روزرسانی خودکار داشبوردها
            this.updateAllDisplays();
        },
        
        handleDeletedRecord(record) {
            // حذف رکورد از لیست‌ها
            this.users = this.users.filter(u => u.id !== record.id);
            this.pendingApprovals = this.pendingApprovals.filter(u => u.id !== record.id);
            
            // اگر کاربر جاری حذف شده
            if (this.currentUser && this.currentUser.id === record.id) {
                this.currentUser = null;
                this.isAdmin = false;
                this.showAppropriatePage();
                this.showNotification('حساب شما حذف شده است', 'error');
            }
            
            // به‌روزرسانی خودکار نمایش‌ها
            this.updateAllDisplays();
        },
        
        updateAllDisplays() {
            // به‌روزرسانی خودکار تمام نمایش‌ها
            if (this.isAdmin) {
                this.renderAdminDashboard();
            } else if (this.currentUser) {
                this.renderUserDashboard();
            }
        },
        
        showRealtimeNotification(eventType, record) {
            let message = '';
            let type = 'info';
            
            switch (eventType) {
                case 'INSERT':
                    message = `تجارت جدید "${record.store_name}" ثبت شد`;
                    type = 'success';
                    break;
                case 'UPDATE':
                    message = `تجارت "${record.store_name}" به‌روزرسانی شد`;
                    type = 'info';
                    break;
                case 'DELETE':
                    message = `تجارت "${record.store_name}" حذف شد`;
                    type = 'error';
                    break;
            }
            
            this.showNotification(message, type);
        },
        
        updateRealtimeStatus(connected = true) {
            const statusElement = document.getElementById('realtimeStatus');
            if (statusElement) {
                if (connected) {
                    statusElement.innerHTML = `
                        <i class="ti ti-circle" style="color: var(--success); font-size: 0.6rem;"></i>
                        <span>Real-Time</span>
                    `;
                    statusElement.className = 'realtime-status';
                } else {
                    statusElement.innerHTML = `
                        <i class="ti ti-circle" style="color: var(--error); font-size: 0.6rem;"></i>
                        <span>Offline</span>
                    `;
                    statusElement.className = 'realtime-status offline';
                }
            }
        },
        // ================= END REAL-TIME SETUP =================
        
        async createDefaultUser() {
            const defaultUser = {
                store_name: "فروشگاه نمونه",
                owner_name: "مدیر نمونه",
                email: "store@example.com",
                password: "123456",
                business_type: "retail",
                approved: true,
                telegram_bot_token: "",
                telegram_chat_id: "",
                business_address: "",
                business_phone: "",
                business_description: "",
                products: [
                    { id: 1, name: "گوشی موبایل سامسونگ", category: "1", price: 8500000, stock: 5, description: "گوشی موبایل سری سامسونگ", isSold: false },
                    { id: 2, name: "لپ تاپ ایسوس", category: "1", price: 15200000, stock: 3, description: "لپ تاپ گیمینگ ایسوس", isSold: false },
                    { id: 3, name: "برنج ایرانی", category: "2", price: 150000, stock: 50, description: "برنج مرغوب ایرانی", isSold: false }
                ],
                categories: [
                    { id: 1, name: "الکترونیک", productCount: 2 },
                    { id: 2, name: "مواد غذایی", productCount: 1 },
                    { id: 3, name: "لوازم خانگی", productCount: 0 },
                    { id: 4, name: "پوشاک", productCount: 0 }
                ],
                sold_items: [],
                exchange_rates: {
                    USD: 85,
                    EUR: 95,
                    GBP: 110,
                    AED: 23,
                    PKR: 0.3,
                    IRR: 0.002
                }
            };
            
            const { data, error } = await this.supabase
                .from('businesses')
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
                let result;
                
                if (!user.id) {
                    // کاربر جدید - درج
                    const { data, error } = await this.supabase
                        .from('businesses')
                        .insert([user])
                        .select();
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        result = data[0];
                        // Real-Time به صورت خودکار توسط اشتراک مدیریت می‌شود
                    }
                } else {
                    // کاربر موجود - به‌روزرسانی
                    const { data, error } = await this.supabase
                        .from('businesses')
                        .update(user)
                        .eq('id', user.id)
                        .select();
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        result = data[0];
                        // Real-Time به صورت خودکار توسط اشتراک مدیریت می‌شود
                    }
                }
                
                return result;
            } catch (error) {
                console.error('خطا در ذخیره کاربر در ابر:', error);
                throw error;
            }
        },
        
        setupEventListeners() {
            // مدیریت تب‌های ورود
            document.getElementById('userLoginTab').addEventListener('click', () => this.switchLoginTab('user'));
            document.getElementById('adminLoginTab').addEventListener('click', () => this.switchLoginTab('admin'));
            
            // فرم‌های ورود
            document.getElementById('userLoginForm').addEventListener('submit', (e) => this.handleUserLogin(e));
            document.getElementById('adminLoginForm').addEventListener('submit', (e) => this.handleAdminLogin(e));
            
            // فرم ثبت‌نام
            document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
            
            // انتخاب نوع تجارت
            document.querySelectorAll('.business-type-card').forEach(card => {
                card.addEventListener('click', () => {
                    document.querySelectorAll('.business-type-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    document.getElementById('businessType').value = card.getAttribute('data-type');
                });
            });
            
            // فرم پروفایل
            document.getElementById('profileForm').addEventListener('submit', (e) => this.handleProfileUpdate(e));
            
            // فرم بازیابی رمز عبور
            document.getElementById('forgotPasswordForm').addEventListener('submit', (e) => this.handleForgotPassword(e));
            
            // دکمه‌های ناوبری
            document.getElementById('showRegisterForm').addEventListener('click', () => this.showRegisterPage());
            document.getElementById('backToLogin').addEventListener('click', () => this.showLoginPage());
            document.getElementById('forgotPassword').addEventListener('click', () => this.showForgotPasswordPage());
            document.getElementById('backToLoginFromForgot').addEventListener('click', () => this.showLoginPage());
            
            // دکمه‌های خروج
            document.getElementById('userLogout').addEventListener('click', () => this.logout());
            document.getElementById('adminLogout').addEventListener('click', () => this.logout());
            
            // دکمه پروفایل
            document.getElementById('userProfile').addEventListener('click', () => this.switchUserTab('profile'));
            
            // فرم‌های مدیریت محصولات و دسته بندی ها
            document.getElementById('productForm').addEventListener('submit', (e) => this.handleAddProduct(e));
            document.getElementById('categoryForm').addEventListener('submit', (e) => this.handleAddCategory(e));
            document.getElementById('editProductForm').addEventListener('submit', (e) => this.handleEditProduct(e));
            
            // دکمه‌های فروش
            document.getElementById('markAsSold').addEventListener('click', () => this.markProductsAsSold());
            
            // دکمه‌های پشتیبان‌گیری
            document.getElementById('backupData').addEventListener('click', () => this.backupData());
            document.getElementById('restoreData').addEventListener('click', () => this.triggerRestore());
            document.getElementById('clearData').addEventListener('click', () => this.clearData());
            document.getElementById('restoreFile').addEventListener('change', (e) => this.restoreData(e));
            
            // دکمه‌های پرینت
            document.getElementById('printProducts').addEventListener('click', () => this.printProducts());
            
            // تنظیمات تلگرام
            document.getElementById('saveTelegramSettings').addEventListener('click', () => this.saveTelegramSettings());
            
            // تنظیمات تجارت
            document.getElementById('saveBusinessSettings').addEventListener('click', () => this.saveBusinessSettings());
            
            // مدیریت مودال‌ها
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
            
            // مدیریت صرافی
            document.getElementById('saveExchangeRates').addEventListener('click', () => this.saveExchangeRates());
            document.getElementById('calculateExchange').addEventListener('click', () => this.calculateExchange());
            
            // انتخاب ارزها
            document.querySelectorAll('.currency-card').forEach(card => {
                card.addEventListener('click', () => {
                    card.classList.toggle('selected');
                });
            });
            
            // مدیریت تب‌های کاربر و ادمین
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
            
            // مدیریت اطلاعیه‌ها
            document.getElementById('notificationBell').addEventListener('click', () => {
                this.openNotificationsModal();
            });
            
            // مدیریت آپلود تصویر پروفایل
            document.getElementById('uploadProfilePictureBtn').addEventListener('click', () => {
                document.getElementById('profilePictureInput').click();
            });
            
            document.getElementById('profilePictureInput').addEventListener('change', (e) => {
                this.handleProfilePictureUpload(e);
            });
        },
        
        // ================= سیستم احراز هویت گوگل =================
        setupGoogleAuth() {
            // تنظیم callback برای احراز هویت گوگل
            window.handleGoogleSignIn = (response) => {
                this.handleGoogleAuth(response);
            };
        },
        
        async handleGoogleAuth(response) {
            try {
                // رمزگشایی اطلاعات کاربر گوگل
                const payload = JSON.parse(atob(response.credential.split('.')[1]));
                const { email, name, sub: googleId } = payload;
                
                // بررسی وجود کاربر با این ایمیل
                let user = this.users.find(u => u.email === email && u.approved);
                
                if (!user) {
                    // بررسی کاربران در انتظار تأیید
                    user = this.pendingApprovals.find(u => u.email === email);
                    if (user) {
                        this.currentUser = user;
                        this.isAdmin = false;
                        this.showAppropriatePage();
                        this.showNotification('حساب شما در انتظار تأیید مدیر است', 'warning');
                        return;
                    }
                }
                
                if (user) {
                    // ورود موفق
                    this.currentUser = user;
                    this.isAdmin = false;
                    this.showAppropriatePage();
                    this.showNotification('ورود با گوگل موفقیت‌آمیز', 'success');
                    this.addNotification('ورود موفق', `شما با حساب گوگل خود وارد شدید.`, 'success');
                } else {
                    // ثبت نام جدید با گوگل
                    const newUser = {
                        store_name: name,
                        owner_name: name,
                        email: email,
                        password: '', // رمز عبور برای ورود با گوگل نیاز نیست
                        business_type: "other",
                        approved: false,
                        google_id: googleId,
                        telegram_bot_token: "",
                        telegram_chat_id: "",
                        business_address: "",
                        business_phone: "",
                        business_description: "",
                        products: [],
                        categories: [
                            { id: 1, name: "الکترونیک", productCount: 0 },
                            { id: 2, name: "مواد غذایی", productCount: 0 },
                            { id: 3, name: "لوازم خانگی", productCount: 0 },
                            { id: 4, name: "پوشاک", productCount: 0 }
                        ],
                        sold_items: [],
                        exchange_rates: {
                            USD: 85,
                            EUR: 95,
                            GBP: 110,
                            AED: 23,
                            PKR: 0.3,
                            IRR: 0.002
                        }
                    };
                    
                    const savedUser = await this.saveUserToCloud(newUser);
                    if (savedUser) {
                        this.pendingApprovals.push(savedUser);
                        this.currentUser = savedUser;
                        this.isAdmin = false;
                        this.showAppropriatePage();
                        
                        this.showNotification('ثبت نام با گوگل موفقیت‌آمیز. منتظر تأیید مدیر باشید', 'success');
                        
                        // ارسال پیام به مدیر
                        this.sendToAdminTelegram(
                            `🏪 درخواست ثبت نام جدید با گوگل\n\n` +
                            `تجارت: ${name}\n` +
                            `ایمیل: ${email}\n` +
                            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n\n` +
                            `لطفا به پنل مدیریت مراجعه کنید.`
                        );
                        
                        this.addNotification('ثبت نام جدید', `تجارت ${name} با گوگل ثبت نام کرده است.`, 'info');
                    }
                }
            } catch (error) {
                console.error('خطا در احراز هویت گوگل:', error);
                this.showNotification('خطا در ورود با گوگل', 'error');
            }
        },
        
        // ================= سیستم اطلاع‌رسانی پیشرفته =================
        loadNotifications() {
            // بارگذاری اطلاعیه‌ها از localStorage
            const savedNotifications = localStorage.getItem('notifications');
            if (savedNotifications) {
                this.notifications = JSON.parse(savedNotifications);
            } else {
                // اطلاعیه‌های پیشفرض
                this.notifications = [
                    {
                        id: 1,
                        title: 'خوش آمدید',
                        message: 'به سیستم مدیریت جامع تجارت خوش آمدید',
                        type: 'info',
                        timestamp: new Date().toISOString(),
                        read: false
                    },
                    {
                        id: 2,
                        title: 'بررسی امنیتی',
                        message: 'لطفاً رمز عبور خود را به‌روزرسانی کنید',
                        type: 'warning',
                        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 روز پیش
                        read: false
                    }
                ];
            }
            
            this.updateNotificationBadge();
        },
        
        saveNotifications() {
            localStorage.setItem('notifications', JSON.stringify(this.notifications));
            this.updateNotificationBadge();
        },
        
        addNotification(title, message, type = 'info') {
            const newNotification = {
                id: Date.now(),
                title,
                message,
                type,
                timestamp: new Date().toISOString(),
                read: false
            };
            
            this.notifications.unshift(newNotification);
            this.saveNotifications();
            
            // نمایش نوتیفیکیشن لحظه‌ای
            this.showNotification(message, type);
        },
        
        updateNotificationBadge() {
            const badge = document.getElementById('notificationBadge');
            this.unreadNotifications = this.notifications.filter(n => !n.read).length;
            
            if (badge) {
                if (this.unreadNotifications > 0) {
                    badge.textContent = this.unreadNotifications > 99 ? '99+' : this.unreadNotifications;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        },
        
        openNotificationsModal() {
            const modal = document.getElementById('notificationsModal');
            const list = document.getElementById('notificationsList');
            
            list.innerHTML = '';
            
            if (this.notifications.length === 0) {
                list.innerHTML = '<div class="empty-state"><i class="ti ti-bell"></i><p>هیچ اطلاعی‌های وجود ندارد</p></div>';
            } else {
                this.notifications.forEach(notification => {
                    const notificationItem = document.createElement('div');
                    notificationItem.className = `notification-item ${notification.read ? '' : 'unread'}`;
                    notificationItem.innerHTML = `
                        <div>
                            <strong>${notification.title}</strong>
                            <p>${notification.message}</p>
                            <div class="notification-time">${new Date(notification.timestamp).toLocaleDateString('fa-IR')}</div>
                        </div>
                    `;
                    
                    notificationItem.addEventListener('click', () => {
                        this.markNotificationAsRead(notification.id);
                        notificationItem.classList.remove('unread');
                    });
                    
                    list.appendChild(notificationItem);
                });
            }
            
            modal.style.display = 'flex';
        },
        
        markNotificationAsRead(notificationId) {
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                notification.read = true;
                this.saveNotifications();
            }
        },
        
        markAllNotificationsAsRead() {
            this.notifications.forEach(notification => {
                notification.read = true;
            });
            this.saveNotifications();
        },
        
        // ================= مدیریت پروفایل کامل =================
        handleProfilePictureUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            // بررسی نوع فایل
            if (!file.type.startsWith('image/')) {
                this.showNotification('لطفاً یک فایل تصویر انتخاب کنید', 'error');
                return;
            }
            
            // بررسی حجم فایل (حداکثر 2MB)
            if (file.size > 2 * 1024 * 1024) {
                this.showNotification('حجم فایل نباید بیشتر از 2 مگابایت باشد', 'error');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = event.target.result;
                
                // نمایش پیش‌نمایش
                const preview = document.getElementById('profilePicturePreview');
                preview.innerHTML = `<img src="${imageData}" alt="پیش‌نمایش">`;
                preview.style.display = 'block';
                
                // ذخیره تصویر در پروفایل کاربر
                if (this.currentUser) {
                    this.currentUser.profilePicture = imageData;
                    this.saveUserToCloud(this.currentUser);
                    this.updateProfilePicture();
                    this.showNotification('تصویر پروفایل با موفقیت آپلود شد', 'success');
                }
            };
            
            reader.readAsDataURL(file);
        },
        
        updateProfilePicture() {
            const profilePicture = document.getElementById('profilePicture');
            const userAvatar = document.getElementById('userAvatar');
            
            if (this.currentUser && this.currentUser.profilePicture) {
                profilePicture.innerHTML = `<img src="${this.currentUser.profilePicture}" alt="تصویر پروفایل">`;
                userAvatar.innerHTML = `<img src="${this.currentUser.profilePicture}" alt="تصویر پروفایل">`;
            } else {
                const initial = this.currentUser ? this.currentUser.store_name.charAt(0) : '?';
                profilePicture.textContent = initial;
                userAvatar.textContent = initial;
            }
        },
        
        // ================= منوی موبایل =================
        setupMobileMenu() {
            const menuBtn = document.getElementById('mobileMenuBtn');
            const menuClose = document.getElementById('mobileMenuClose');
            const mobileMenu = document.getElementById('mobileMenu');
            
            menuBtn.addEventListener('click', () => {
                mobileMenu.classList.add('active');
                this.renderMobileMenu();
            });
            
            menuClose.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
            });
        },
        
        renderMobileMenu() {
            const mobileNav = document.getElementById('mobileNav');
            mobileNav.innerHTML = '';
            
            if (this.currentUser) {
                // منوی کاربران عادی
                const userMenuItems = [
                    { icon: 'ti ti-package', text: 'محصولات', action: () => this.switchUserTab('products') },
                    { icon: 'ti ti-category', text: 'دسته‌بندی‌ها', action: () => this.switchUserTab('categories') },
                    { icon: 'ti ti-shopping-cart', text: 'فروش‌ها', action: () => this.switchUserTab('sales') },
                    { icon: 'ti ti-currency-dollar', text: 'صرافی', action: () => this.switchUserTab('exchange') },
                    { icon: 'ti ti-settings', text: 'تنظیمات', action: () => this.switchUserTab('settings') },
                    { icon: 'ti ti-user', text: 'پروفایل', action: () => this.switchUserTab('profile') },
                    { icon: 'ti ti-logout', text: 'خروج', action: () => this.logout() }
                ];
                
                userMenuItems.forEach(item => {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'mobile-nav-item';
                    menuItem.innerHTML = `
                        <i class="${item.icon}"></i>
                        <span>${item.text}</span>
                    `;
                    menuItem.addEventListener('click', () => {
                        item.action();
                        document.getElementById('mobileMenu').classList.remove('active');
                    });
                    mobileNav.appendChild(menuItem);
                });
            } else {
                // منوی ورود
                const loginMenuItems = [
                    { icon: 'ti ti-login', text: 'ورود تجارت', action: () => this.switchLoginTab('user') },
                    { icon: 'ti ti-user-plus', text: 'ثبت نام', action: () => this.showRegisterPage() }
                ];
                
                loginMenuItems.forEach(item => {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'mobile-nav-item';
                    menuItem.innerHTML = `
                        <i class="${item.icon}"></i>
                        <span>${item.text}</span>
                    `;
                    menuItem.addEventListener('click', () => {
                        item.action();
                        document.getElementById('mobileMenu').classList.remove('active');
                    });
                    mobileNav.appendChild(menuItem);
                });
            }
        },
        
        // ================= بهبود رمز عبور =================
        setupPasswordStrength() {
            const passwordInput = document.getElementById('registerPassword');
            const confirmInput = document.getElementById('confirmPassword');
            
            if (passwordInput) {
                passwordInput.addEventListener('input', () => {
                    this.checkPasswordStrength(passwordInput.value);
                });
            }
            
            if (confirmInput) {
                confirmInput.addEventListener('input', () => {
                    this.checkPasswordMatch();
                });
            }
        },
        
        checkPasswordStrength(password) {
            let strength = 0;
            const bar = document.getElementById('passwordStrengthBar');
            const text = document.getElementById('passwordStrengthText');
            
            if (!bar || !text) return;
            
            // بررسی طول رمز عبور
            if (password.length >= 8) strength += 25;
            
            // بررسی وجود حروف بزرگ و کوچک
            if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
            
            // بررسی وجود اعداد
            if (/\d/.test(password)) strength += 25;
            
            // بررسی وجود کاراکترهای خاص
            if (/[^a-zA-Z\d]/.test(password)) strength += 25;
            
            // به‌روزرسانی نوار و متن
            bar.style.width = `${strength}%`;
            
            if (strength < 50) {
                bar.style.background = 'var(--error)';
                text.textContent = 'قدرت رمز عبور: ضعیف';
                text.style.color = 'var(--error)';
            } else if (strength < 75) {
                bar.style.background = 'var(--warning)';
                text.textContent = 'قدرت رمز عبور: متوسط';
                text.style.color = 'var(--warning)';
            } else {
                bar.style.background = 'var(--success)';
                text.textContent = 'قدرت رمز عبور: قوی';
                text.style.color = 'var(--success)';
            }
        },
        
        checkPasswordMatch() {
            const password = document.getElementById('registerPassword').value;
            const confirm = document.getElementById('confirmPassword').value;
            const matchDiv = document.getElementById('passwordMatch');
            
            if (!matchDiv) return;
            
            if (confirm === '') {
                matchDiv.textContent = '';
                matchDiv.style.color = '';
            } else if (password === confirm) {
                matchDiv.textContent = '✓ رمز عبور مطابقت دارد';
                matchDiv.style.color = 'var(--success)';
            } else {
                matchDiv.textContent = '✗ رمز عبور مطابقت ندارد';
                matchDiv.style.color = 'var(--error)';
            }
        },
        
        // ================= توابع اصلی سیستم =================
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
            const forgotPasswordPage = document.getElementById('forgotPasswordPage');
            const userDashboard = document.getElementById('userDashboard');
            const adminDashboard = document.getElementById('adminDashboard');
            const userInfo = document.getElementById('userInfo');
            const userLogout = document.getElementById('userLogout');
            const adminLogout = document.getElementById('adminLogout');
            
            // مخفی کردن تمام صفحات
            loginPage.classList.add('hidden');
            registerPage.classList.add('hidden');
            forgotPasswordPage.classList.add('hidden');
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
            document.getElementById('forgotPasswordPage').classList.add('hidden');
        },
        
        showRegisterPage() {
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('registerPage').classList.remove('hidden');
            document.getElementById('forgotPasswordPage').classList.add('hidden');
        },
        
        showForgotPasswordPage() {
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('registerPage').classList.add('hidden');
            document.getElementById('forgotPasswordPage').classList.remove('hidden');
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
                    this.showNotification('ورود موفقیت‌آمیز', 'success');
                    this.addNotification('ورود موفق', `شما با موفقیت به سیستم وارد شدید.`, 'success');
                    
                    // ذخیره وضعیت در localStorage
                    localStorage.setItem('userSession', JSON.stringify({
                        user: this.currentUser,
                        isAdmin: this.isAdmin,
                        timestamp: Date.now()
                    }));
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
                this.showNotification('ورود مدیر موفقیت‌آمیز', 'success');
                this.addNotification('ورود مدیر', `مدیر سیستم با موفقیت وارد شد.`, 'success');
                
                // ذخیره وضعیت در localStorage
                localStorage.setItem('userSession', JSON.stringify({
                    user: this.currentUser,
                    isAdmin: this.isAdmin,
                    timestamp: Date.now()
                }));
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
            const businessType = document.getElementById('businessType').value;
            
            if (!businessType) {
                this.showNotification('لطفا نوع تجارت را انتخاب کنید', 'error');
                return;
            }
            
            // بررسی تطابق رمز عبور
            if (password !== confirmPassword) {
                this.showNotification('رمز عبور و تکرار آن مطابقت ندارند', 'error');
                return;
            }
            
            // بررسی قدرت رمز عبور
            if (password.length < 6) {
                this.showNotification('رمز عبور باید حداقل 6 کاراکتر باشد', 'error');
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
                business_type: businessType,
                approved: false, // کاربران معمولی نیاز به تأیید دارند
                telegram_bot_token: "",
                telegram_chat_id: "",
                business_address: "",
                business_phone: "",
                business_description: "",
                products: [],
                categories: [
                    { id: 1, name: "الکترونیک", productCount: 0 },
                    { id: 2, name: "مواد غذایی", productCount: 0 },
                    { id: 3, name: "لوازم خانگی", productCount: 0 },
                    { id: 4, name: "پوشاک", productCount: 0 }
                ],
                sold_items: [],
                exchange_rates: {
                    USD: 85,
                    EUR: 95,
                    GBP: 110,
                    AED: 23,
                    PKR: 0.3,
                    IRR: 0.002
                }
            };
            
            try {
                const savedUser = await this.saveUserToCloud(newUser);
                if (savedUser) {
                    this.pendingApprovals.push(savedUser);
                    this.showNotification('ثبت نام موفقیت‌آمیز. منتظر تأیید مدیر باشید', 'success');
                    this.showLoginPage();
                    
                    // ارسال پیام به مدیر
                    this.sendToAdminTelegram(
                        `🏪 درخواست ثبت نام جدید\n\n` +
                        `تجارت: ${storeName}\n` +
                        `نوع: ${this.businessTypes[businessType]}\n` +
                        `صاحب: ${ownerName}\n` +
                        `ایمیل: ${email}\n` +
                        `تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n\n` +
                        `لطفا به پنل مدیریت مراجعه کنید.`
                    );
                    
                    this.addNotification('ثبت نام جدید', `تجارت ${storeName} درخواست ثبت نام داده است.`, 'info');
                }
            } catch (error) {
                console.error('خطا در ثبت نام:', error);
                this.showNotification('خطا در ثبت نام', 'error');
            }
        },
        
        async handleCreateStore(e) {
            e.preventDefault();
            const storeName = document.getElementById('newStoreName').value;
            const businessType = document.getElementById('newBusinessType').value;
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
                business_type: businessType,
                approved: true,
                telegram_bot_token: "",
                telegram_chat_id: "",
                business_address: "",
                business_phone: "",
                business_description: "",
                products: [],
                categories: [
                    { id: 1, name: "الکترونیک", productCount: 0 },
                    { id: 2, name: "مواد غذایی", productCount: 0 },
                    { id: 3, name: "لوازم خانگی", productCount: 0 },
                    { id: 4, name: "پوشاک", productCount: 0 }
                ],
                sold_items: [],
                exchange_rates: {
                    USD: 85,
                    EUR: 95,
                    GBP: 110,
                    AED: 23,
                    PKR: 0.3,
                    IRR: 0.002
                }
            };
            
            try {
                const savedUser = await this.saveUserToCloud(newUser);
                if (savedUser) {
                    this.users.push(savedUser);
                    this.closeAllModals();
                    this.renderAdminDashboard();
                    
                    this.showNotification(`حساب تجارت ${storeName} با موفقیت ایجاد شد`, 'success');
                    
                    // ارسال پیام به مدیر
                    this.sendToAdminTelegram(
                        `✅ حساب جدید ایجاد شد\n\n` +
                        `تجارت: ${storeName}\n` +
                        `نوع: ${this.businessTypes[businessType]}\n` +
                        `صاحب: ${ownerName}\n` +
                        `ایمیل: ${email}\n` +
                        `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                    );
                }
            } catch (error) {
                console.error('خطا در ایجاد تجارت:', error);
                this.showNotification('خطا در ایجاد تجارت', 'error');
            }
        },
        
        async handleProfileUpdate(e) {
            e.preventDefault();
            if (!this.currentUser) return;
            
            const storeName = document.getElementById('profileStoreName').value;
            const ownerName = document.getElementById('profileOwnerName').value;
            const email = document.getElementById('profileEmail').value;
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;
            
            // بررسی تغییر ایمیل
            if (email !== this.currentUser.email) {
                // بررسی وجود ایمیل جدید
                if (this.users.find(u => u.email === email && u.id !== this.currentUser.id) || 
                    this.pendingApprovals.find(u => u.email === email)) {
                    this.showNotification('این ایمیل قبلاً توسط کاربر دیگری استفاده شده است', 'error');
                    return;
                }
            }
            
            // بررسی تغییر رمز عبور
            if (newPassword) {
                if (newPassword !== confirmNewPassword) {
                    this.showNotification('رمز عبور جدید و تکرار آن مطابقت ندارند', 'error');
                    return;
                }
                
                if (!currentPassword) {
                    this.showNotification('برای تغییر رمز عبور، رمز عبور فعلی را وارد کنید', 'error');
                    return;
                }
                
                if (currentPassword !== this.currentUser.password) {
                    this.showNotification('رمز عبور فعلی اشتباه است', 'error');
                    return;
                }
                
                this.currentUser.password = newPassword;
            }
            
            // به‌روزرسانی اطلاعات
            this.currentUser.store_name = storeName;
            this.currentUser.owner_name = ownerName;
            this.currentUser.email = email;
            
            try {
                await this.saveUserToCloud(this.currentUser);
                this.showNotification('پروفایل با موفقیت به‌روزرسانی شد', 'success');
                this.renderUserDashboard();
                
                // پاک کردن فیلدهای رمز عبور
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmNewPassword').value = '';
                
                // ارسال پیام به تلگرام
                this.sendToUserTelegram(
                    `👤 پروفایل به‌روزرسانی شد\n\n` +
                    `تغییرات در اطلاعات حساب کاربری شما اعمال شد.\n` +
                    `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                );
            } catch (error) {
                console.error('خطا در به‌روزرسانی پروفایل:', error);
                this.showNotification('خطا در به‌روزرسانی پروفایل', 'error');
            }
        },
        
        async handleForgotPassword(e) {
            e.preventDefault();
            const email = document.getElementById('recoveryEmail').value;
            
            // در اینجا باید با سرویس ایمیل واقعی یکپارچه شود
            // برای نمونه، ما فقط یک پیام نمایش می‌دهیم
            
            this.showNotification('لینک بازیابی رمز عبور به ایمیل شما ارسال شد', 'success');
            setTimeout(() => {
                this.showLoginPage();
            }, 3000);
        },
        
        async logout() {
            this.currentUser = null;
            this.isAdmin = false;
            localStorage.removeItem('userSession');
            this.showAppropriatePage();
            this.showNotification('خروج موفقیت‌آمیز', 'info');
        },
        
        renderUserDashboard() {
            if (!this.currentUser) return;
            
            // به‌روزرسانی اطلاعات کاربر
            document.getElementById('userStoreName').textContent = this.currentUser.store_name;
            document.getElementById('userName').textContent = this.currentUser.store_name;
            this.updateProfilePicture();
            document.getElementById('userBusinessType').textContent = this.businessTypes[this.currentUser.business_type] || 'نامشخص';
            
            // نمایش وضعیت تأیید کاربر
            const userStatusElement = document.getElementById('userStatus');
            const pendingApprovalElement = document.getElementById('pendingApproval');
            const userDashboardContent = document.getElementById('userDashboardContent');
            const exchangeTab = document.getElementById('exchangeTab');
            
            if (this.currentUser.approved) {
                userStatusElement.innerHTML = '<span class="user-status status-approved">تأیید شده</span>';
                pendingApprovalElement.style.display = 'none';
                userDashboardContent.style.display = 'block';
                
                // نمایش تب صرافی فقط برای صرافی ها
                if (this.currentUser.business_type === 'exchange') {
                    exchangeTab.style.display = 'block';
                } else {
                    exchangeTab.style.display = 'none';
                }
                
                // به‌روزرسانی آمار
                this.updateUserStats();
                
                // رندر محصولات و دسته بندی ها
                this.renderUserProducts();
                this.renderUserCategories();
                this.renderUserSoldItems();
                this.populateUserCategoryDropdowns();
                this.updateUserProductsChecklist();
                
                // بارگذاری تنظیمات تلگرام کاربر
                if (document.getElementById('userTelegramToken')) {
                    document.getElementById('userTelegramToken').value = this.currentUser.telegram_bot_token || '';
                    document.getElementById('userTelegramChatId').value = this.currentUser.telegram_chat_id || '';
                }
                
                // بارگذاری تنظیمات تجارت
                if (document.getElementById('businessAddress')) {
                    document.getElementById('businessAddress').value = this.currentUser.business_address || '';
                    document.getElementById('businessPhone').value = this.currentUser.business_phone || '';
                    document.getElementById('businessDescription').value = this.currentUser.business_description || '';
                }
                
                // بارگذاری اطلاعات پروفایل
                if (document.getElementById('profileStoreName')) {
                    document.getElementById('profileStoreName').value = this.currentUser.store_name;
                    document.getElementById('profileOwnerName').value = this.currentUser.owner_name;
                    document.getElementById('profileEmail').value = this.currentUser.email;
                }
                
                // رندر نرخ‌های ارز
                this.renderExchangeRates();
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
            
            // تعداد فروش امروز
            const today = new Date().toDateString();
            const todaySales = this.currentUser.sold_items ? this.currentUser.sold_items.filter(item => 
                new Date(item.soldAt).toDateString() === today
            ).length : 0;
            document.getElementById('totalSold').textContent = todaySales;
            
            // درآمد امروز
            const todayRevenue = this.currentUser.sold_items ? this.currentUser.sold_items
                .filter(item => new Date(item.soldAt).toDateString() === today)
                .reduce((total, item) => total + item.price, 0) : 0;
            document.getElementById('totalRevenue').textContent = todayRevenue.toLocaleString('fa-IR');
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
                            <div class="empty-state">
                                <i class="ti ti-package"></i>
                                <p>هیچ محصولی ثبت نشده است</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
            
            this.currentUser.products.forEach(product => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.name}</td>
                    <td>${this.getUserCategoryName(product.category)}</td>
                    <td>${product.price.toLocaleString('fa-IR')}</td>
                    <td>${product.stock}</td>
                    <td>${product.isSold ? '<span class="badge badge-danger">فروخته شده</span>' : '<span class="badge badge-success">موجود</span>'}</td>
                    <td class="actions">
                        <button class="btn-success" onclick="SystemState.openEditProductModal(${product.id})">ویرایش</button>
                        <button class="btn-danger" onclick="SystemState.deleteUserProduct(${product.id})">حذف</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        },
        
        renderUserCategories() {
            if (!this.currentUser) return;
            
            const tbody = document.getElementById('categoriesTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            // بررسی وجود دسته بندی ها
            if (!this.currentUser.categories || this.currentUser.categories.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align: center; color: var(--text-light);">
                            <div class="empty-state">
                                <i class="ti ti-category"></i>
                                <p>هیچ دسته بندی ثبت نشده است</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
            
            this.currentUser.categories.forEach(category => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${category.name}</td>
                    <td>${category.productCount || 0}</td>
                    <td class="actions">
                        <button class="btn-success" onclick="SystemState.editUserCategory(${category.id})">ویرایش</button>
                        <button class="btn-danger" onclick="SystemState.deleteUserCategory(${category.id})">حذف</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        },
        
        renderUserSoldItems() {
            if (!this.currentUser) return;
            
            const soldItemsList = document.getElementById('soldItemsList');
            if (!soldItemsList) return;
            
            soldItemsList.innerHTML = '';
            
            // نمایش فقط فروش های امروز
            const today = new Date().toDateString();
            const todaySales = this.currentUser.sold_items ? this.currentUser.sold_items.filter(item => 
                new Date(item.soldAt).toDateString() === today
            ) : [];
            
            if (todaySales.length === 0) {
                soldItemsList.innerHTML = '<div class="empty-state"><i class="ti ti-shopping-cart"></i><p>هیچ فروشی برای امروز ثبت نشده است</p></div>';
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
                document.getElementById('editProductCategory')
            ];
            
            categorySelects.forEach(select => {
                if (select) {
                    // حفظ مقدار فعلی
                    const currentValue = select.value;
                    select.innerHTML = '<option value="">انتخاب کنید</option>';
                    
                    // اضافه کردن دسته بندی ها
                    this.currentUser.categories.forEach(category => {
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
        
        updateUserProductsChecklist() {
            if (!this.currentUser) return;
            
            const checklist = document.getElementById('productsChecklist');
            if (!checklist) return;
            
            checklist.innerHTML = '';
            
            const availableProducts = this.currentUser.products ? this.currentUser.products.filter(p => !p.isSold && p.stock > 0) : [];
            
            if (availableProducts.length === 0) {
                checklist.innerHTML = '<div class="empty-state"><i class="ti ti-package"></i><p>هیچ محصولی برای فروش موجود نیست</p></div>';
                return;
            }
            
            availableProducts.forEach(product => {
                const checkboxItem = document.createElement('div');
                checkboxItem.className = 'checkbox-item';
                checkboxItem.innerHTML = `
                    <input type="checkbox" id="product_${product.id}" value="${product.id}">
                    <label for="product_${product.id}">
                        ${product.name} - ${product.price.toLocaleString('fa-IR')} افغانی (موجودی: ${product.stock})
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
            const stock = parseInt(document.getElementById('productStock').value);
            const description = document.getElementById('productDescription').value;
            
            if (!name || !category || !price || !stock) {
                this.showNotification('لطفا تمام فیلدهای ضروری را پر کنید', 'error');
                return;
            }
            
            const newProduct = {
                id: Date.now(),
                name,
                category,
                price,
                stock,
                description,
                isSold: false
            };
            
            if (!this.currentUser.products) {
                this.currentUser.products = [];
            }
            this.currentUser.products.push(newProduct);
            
            // به‌روزرسانی تعداد محصولات در دسته بندی
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
                    `موجودی: ${stock}\n` +
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
            
            if (!name) {
                this.showNotification('لطفا نام دسته بندی را وارد کنید', 'error');
                return;
            }
            
            const newCategory = {
                id: Date.now(),
                name,
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
            document.getElementById('editProductStock').value = product.stock;
            document.getElementById('editProductDescription').value = product.description || '';
            
            // مطمئن شویم dropdownها پر شده‌اند
            this.populateUserCategoryDropdowns();
            
            document.getElementById('editProductModal').style.display = 'flex';
        },
        
        async handleEditProduct(e) {
            e.preventDefault();
            if (!this.currentUser || !this.currentUser.products) return;
            
            const productId = parseInt(document.getElementById('editProductId').value);
            const name = document.getElementById('editProductName').value;
            const category = document.getElementById('editProductCategory').value;
            const price = parseInt(document.getElementById('editProductPrice').value);
            const stock = parseInt(document.getElementById('editProductStock').value);
            const description = document.getElementById('editProductDescription').value;
            
            if (!name || !category || !price || !stock) {
                this.showNotification('لطفا تمام فیلدهای ضروری را پر کنید', 'error');
                return;
            }
            
            const productIndex = this.currentUser.products.findIndex(p => p.id === productId);
            if (productIndex === -1) return;
            
            // ذخیره وضعیت قبلی برای به‌روزرسانی آمار دسته بندی
            const oldCategory = this.currentUser.products[productIndex].category;
            
            // به‌روزرسانی محصول
            this.currentUser.products[productIndex] = {
                ...this.currentUser.products[productIndex],
                name,
                category,
                price,
                stock,
                description
            };
            
            // به‌روزرسانی آمار دسته بندی ها
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
                    `موجودی جدید: ${stock}\n` +
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
            
            // به‌روزرسانی آمار دسته بندی
            if (this.currentUser.categories) {
                const categoryObj = this.currentUser.categories.find(c => c.id == product.category);
                if (categoryObj) {
                    categoryObj.productCount = Math.max(0, (categoryObj.productCount || 0) - 1);
                }
            }
            
            // حذف محصول
            this.currentUser.products.splice(productIndex, 1);
            
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
                    
                    // کاهش موجودی
                    if (product.stock > 0) {
                        product.stock -= 1;
                        
                        // اگر موجودی صفر شد، وضعیت را به فروخته شده تغییر دهید
                        if (product.stock === 0) {
                            product.isSold = true;
                        }
                        
                        // اضافه کردن به لیست فروش ها
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
                    this.currentUser.products[productIndex].stock += 1;
                    this.currentUser.products[productIndex].isSold = false;
                }
            }
            
            // حذف از لیست فروش ها
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
        
        // ================= توابع جدید برای مدیریت صرافی =================
        renderExchangeRates() {
            if (!this.currentUser) return;
            
            const container = document.getElementById('exchangeRatesContainer');
            if (!container) return;
            
            container.innerHTML = '';
            
            // ایجاد نرخ‌های ارز پیشفرض اگر وجود ندارند
            if (!this.currentUser.exchange_rates) {
                this.currentUser.exchange_rates = {
                    USD: 85,
                    EUR: 95,
                    GBP: 110,
                    AED: 23,
                    PKR: 0.3,
                    IRR: 0.002
                };
            }
            
            this.currencies.forEach(currency => {
                const rateDiv = document.createElement('div');
                rateDiv.className = 'form-group';
                rateDiv.innerHTML = `
                    <label for="rate_${currency}">نرخ ${currency} به AFN:</label>
                    <div class="exchange-rate">
                        <input type="number" id="rate_${currency}" value="${this.currentUser.exchange_rates[currency] || 0}" step="0.01" min="0">
                        <span>${currency} = 1 AFN</span>
                    </div>
                `;
                container.appendChild(rateDiv);
            });
        },
        
        async saveExchangeRates() {
            if (!this.currentUser) return;
            
            const rates = {};
            this.currencies.forEach(currency => {
                const rateInput = document.getElementById(`rate_${currency}`);
                if (rateInput) {
                    rates[currency] = parseFloat(rateInput.value) || 0;
                }
            });
            
            this.currentUser.exchange_rates = rates;
            
            try {
                await this.saveUserToCloud(this.currentUser);
                this.showNotification('نرخ‌های ارز با موفقیت ذخیره شد', 'success');
            } catch (error) {
                this.showNotification('خطا در ذخیره نرخ‌های ارز', 'error');
            }
        },
        
        calculateExchange() {
            if (!this.currentUser || !this.currentUser.exchange_rates) return;
            
            const amount = parseFloat(document.getElementById('calcAmount').value);
            const fromCurrency = document.getElementById('calcFrom').value;
            const toCurrency = document.getElementById('calcTo').value;
            
            if (!amount || amount <= 0) {
                this.showNotification('لطفا مبلغ معتبر وارد کنید', 'error');
                return;
            }
            
            let result;
            
            if (fromCurrency === 'AFN') {
                // تبدیل از افغانی به ارز دیگر
                result = amount / (this.currentUser.exchange_rates[toCurrency] || 1);
            } else if (toCurrency === 'AFN') {
                // تبدیل از ارز دیگر به افغانی
                result = amount * (this.currentUser.exchange_rates[fromCurrency] || 1);
            } else {
                // تبدیل بین دو ارز خارجی
                const toAfn = amount * (this.currentUser.exchange_rates[fromCurrency] || 1);
                result = toAfn / (this.currentUser.exchange_rates[toCurrency] || 1);
            }
            
            document.getElementById('calcResult').value = result.toFixed(2);
        },
        
        async saveBusinessSettings() {
            if (!this.currentUser) return;
            
            const address = document.getElementById('businessAddress').value;
            const phone = document.getElementById('businessPhone').value;
            const description = document.getElementById('businessDescription').value;
            
            this.currentUser.business_address = address;
            this.currentUser.business_phone = phone;
            this.currentUser.business_description = description;
            
            try {
                await this.saveUserToCloud(this.currentUser);
                this.showNotification('تنظیمات تجارت با موفقیت ذخیره شد', 'success');
            } catch (error) {
                this.showNotification('خطا در ذخیره تنظیمات تجارت', 'error');
            }
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
                            this.showNotification('داده‌ها با موفقیت بازیابی شدند', 'success');
                        } catch (error) {
                            this.showNotification('خطا در ذخیره داده‌های بازیابی شده', 'error');
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
                business_type: this.currentUser.business_type,
                approved: this.currentUser.approved,
                telegram_bot_token: this.currentUser.telegram_bot_token,
                telegram_chat_id: this.currentUser.telegram_chat_id,
                business_address: this.currentUser.business_address,
                business_phone: this.currentUser.business_phone,
                business_description: this.currentUser.business_description
            };
            
            // ریست کردن داده ها
            this.currentUser = {
                ...userBase,
                products: [],
                categories: [
                    { id: 1, name: "الکترونیک", productCount: 0 },
                    { id: 2, name: "مواد غذایی", productCount: 0 },
                    { id: 3, name: "لوازم خانگی", productCount: 0 },
                    { id: 4, name: "پوشاک", productCount: 0 }
                ],
                sold_items: [],
                exchange_rates: {
                    USD: 85,
                    EUR: 95,
                    GBP: 110,
                    AED: 23,
                    PKR: 0.3,
                    IRR: 0.002
                }
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
                this.showNotification('خطا در پاک کردن داده‌ها', 'error');
            }
        },
        
        printProducts() {
            if (!this.currentUser) return;
            
            const printArea = document.getElementById('printArea');
            printArea.innerHTML = '';
            
            let content = `
                <div class="print-header" style="text-align: center; margin-bottom: 30px;">
                    <h2>گزارش محصولات</h2>
                    <p>تجارت: ${this.currentUser.store_name}</p>
                    <p>تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
                </div>
                <table class="print-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">نام محصول</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">دسته بندی</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">قیمت (افغانی)</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">موجودی</th>
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
                            <td style="border: 1px solid #ddd; padding: 12px;">${product.stock}</td>
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
                    <p>سیستم مدیریت تجارت - نسخه ${SYSTEM_CONFIG.version}</p>
                </div>
            `;
            
            printArea.innerHTML = content;
            printArea.style.display = 'block';
            window.print();
            printArea.style.display = 'none';
        },
        
        exportProducts() {
            if (!this.currentUser || !this.currentUser.products) return;
            
            const productsData = this.currentUser.products.map(product => ({
                نام: product.name,
                دسته‌بندی: this.getUserCategoryName(product.category),
                قیمت: product.price,
                موجودی: product.stock,
                وضعیت: product.isSold ? 'فروخته شده' : 'موجود',
                توضیحات: product.description || ''
            }));
            
            const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                + "نام,دسته‌بندی,قیمت,موجودی,وضعیت,توضیحات\n"
                + productsData.map(row => 
                    `"${row.نام}","${row.دسته‌بندی}",${row.قیمت},${row.موجودی},"${row.وضعیت}","${row.توضیحات}"`
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
        
        closeAllModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        },
        
        switchUserTab(tabName) {
            // مخفی کردن تمام تب‌ها
            document.querySelectorAll('.user-tab').forEach(tab => {
                tab.classList.add('hidden');
            });
            
            // غیرفعال کردن تمام تب‌ها
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
            // مخفی کردن تمام تب‌ها
            document.querySelectorAll('.admin-tab').forEach(tab => {
                tab.classList.add('hidden');
            });
            
            // غیرفعال کردن تمام تب‌ها
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
        
        // ================= مدیریت پنل ادمین =================
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
            
            // محاسبه تجارت های جدید (ایجاد شده در 7 روز گذشته)
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
                storesList.innerHTML = '<p style="text-align: center; color: var(--text-light);">هیچ تجارتی ثبت نام نکرده است</p>';
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
                            نوع: ${this.businessTypes[user.business_type] || 'نامشخص'} | 
                            محصولات: ${user.products ? user.products.length : 0} | 
                            دسته بندی ها: ${user.categories ? user.categories.length : 0} | 
                            فروش: ${user.sold_items ? user.sold_items.length : 0}
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
                            نوع: ${this.businessTypes[user.business_type] || 'نامشخص'} | 
                            تاریخ ثبت‌نام: ${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}
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
        
        // ================= تب اطلاعات کاربران برای مدیر =================
        renderUserCredentials() {
            const userCredentialsTable = document.getElementById('userCredentialsTable');
            if (!userCredentialsTable) return;
            
            userCredentialsTable.innerHTML = '';
            
            // نمایش کاربران تأیید شده
            this.users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.store_name}</td>
                    <td>${this.businessTypes[user.business_type] || 'نامشخص'}</td>
                    <td>${user.owner_name}</td>
                    <td>${user.email}</td>
                    <td class="password-cell">
                        <span class="password-text">${user.password}</span>
                        <button class="btn-info" onclick="SystemState.copyPassword('${user.password}')" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">
                            <i class="ti ti-copy"></i>
                        </button>
                    </td>
                    <td><span class="user-status status-approved">تأیید شده</span></td>
                    <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}</td>
                    <td>${user.google_id ? 'گوگل' : 'ایمیل/رمز عبور'}</td>
                `;
                userCredentialsTable.appendChild(row);
            });
            
            // نمایش کاربران در انتظار تأیید
            this.pendingApprovals.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.store_name}</td>
                    <td>${this.businessTypes[user.business_type] || 'نامشخص'}</td>
                    <td>${user.owner_name}</td>
                    <td>${user.email}</td>
                    <td class="password-cell">
                        <span class="password-text">${user.password}</span>
                        <button class="btn-info" onclick="SystemState.copyPassword('${user.password}')" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">
                            <i class="ti ti-copy"></i>
                        </button>
                    </td>
                    <td><span class="user-status status-pending">در انتظار تأیید</span></td>
                    <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : 'نامشخص'}</td>
                    <td>${user.google_id ? 'گوگل' : 'ایمیل/رمز عبور'}</td>
                `;
                userCredentialsTable.appendChild(row);
            });
            
            // اگر هیچ کاربری وجود ندارد
            if (this.users.length === 0 && this.pendingApprovals.length === 0) {
                userCredentialsTable.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: var(--text-light);">
                            هیچ کاربری ثبت نام نکرده است
                        </td>
                    </tr>
                `;
            }
        },
        
        copyPassword(password) {
            navigator.clipboard.writeText(password).then(() => {
                this.showNotification('رمز عبور کپی شد', 'success');
            }).catch(err => {
                console.error('خطا در کپی کردن رمز عبور:', err);
                this.showNotification('خطا در کپی کردن رمز عبور', 'error');
            });
        },
        
        async approveUser(userId) {
            try {
                const userIndex = this.pendingApprovals.findIndex(u => u.id == userId);
                if (userIndex === -1) return;
                
                const user = this.pendingApprovals[userIndex];
                user.approved = true;
                
                const { error } = await this.supabase
                    .from('businesses')
                    .update({ approved: true })
                    .eq('id', userId);
                
                if (error) throw error;
                
                // به‌روزرسانی لیست‌های محلی
                this.pendingApprovals.splice(userIndex, 1);
                this.users.push(user);
                
                this.renderAdminDashboard();
                
                // ارسال پیام به مدیر
                this.sendToAdminTelegram(
                    `✅ کاربر تأیید شد\n\n` +
                    `تجارت: ${user.store_name}\n` +
                    `نوع: ${this.businessTypes[user.business_type] || 'نامشخص'}\n` +
                    `صاحب: ${user.owner_name}\n` +
                    `ایمیل: ${user.email}\n` +
                    `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`
                );
                
                this.showNotification(`تجارت ${user.store_name} با موفقیت تأیید شد`, 'success');
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
                    .from('businesses')
                    .delete()
                    .eq('id', userId);
                
                if (error) throw error;
                
                // به‌روزرسانی لیست‌های محلی
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
                alert(`جزئیات تجارت:\n\nنام: ${user.store_name}\nنوع: ${this.businessTypes[user.business_type] || 'نامشخص'}\nصاحب: ${user.owner_name}\nایمیل: ${user.email}\nمحصولات: ${user.products ? user.products.length : 0}\nدسته بندی ها: ${user.categories ? user.categories.length : 0}\nفروش ها: ${user.sold_items ? user.sold_items.length : 0}`);
            }
        },
        
        editStore(userId) {
            const user = this.users.find(u => u.id == userId);
            if (user) {
                // در اینجا می‌توانید یک مودال برای ویرایش اطلاعات تجارت ایجاد کنید
                alert(`ویرایش اطلاعات تجارت ${user.store_name}\n\nاین قابلیت در نسخه‌های آینده اضافه خواهد شد.`);
            }
        },
        
        async deleteStore(userId) {
            const user = this.users.find(u => u.id == userId);
            if (user && confirm(`آیا از حذف تجارت ${user.store_name} اطمینان دارید؟ تمام داده های مربوط به این تجارت حذف خواهند شد.`)) {
                try {
                    const { error } = await this.supabase
                        .from('businesses')
                        .delete()
                        .eq('id', userId);
                    
                    if (error) throw error;
                    
                    this.users = this.users.filter(u => u.id !== userId);
                    this.renderAdminDashboard();
                    
                    this.showNotification(`تجارت ${user.store_name} حذف شد`, 'success');
                } catch (error) {
                    console.error('خطا در حذف تجارت:', error);
                    this.showNotification('خطا در حذف تجارت', 'error');
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
            if (confirm('آیا از بازنشانی تمام داده های سیستم اطمینان دارید؟ این عمل تمام کاربران، محصولات و تاریخچه را پاک می‌کند و غیرقابل برگشت است.')) {
                try {
                    // حذف تمام داده‌ها از Supabase
                    const { error } = await this.supabase
                        .from('businesses')
                        .delete()
                        .neq('id', 0); // حذف تمام رکوردها
                    
                    if (error) throw error;
                    
                    this.users = [];
                    this.pendingApprovals = [];
                    this.currentUser = null;
                    this.isAdmin = false;
                    localStorage.removeItem('userSession');
                    await this.createDefaultUser();
                    this.showAppropriatePage();
                    
                    this.showNotification('تمامی داده های سیستم بازنشانی شدند', 'success');
                } catch (error) {
                    console.error('خطا در بازنشانی داده‌ها:', error);
                    this.showNotification('خطا در بازنشانی داده‌ها', 'error');
                }
            }
        },
        
        viewAllData() {
            const allData = {
                users: this.users,
                pendingApprovals: this.pendingApprovals,
                adminCredentials: this.adminCredentials
            };
            
            alert('داده‌های سیستم:\n\n' + JSON.stringify(allData, null, 2));
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
    window.handleGoogleSignIn = SystemState.handleGoogleAuth;
})();