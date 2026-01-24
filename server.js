const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer'); 

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// OTURUM
app.use(session({
    secret: 'gizli_anahtar_serilink_v30_pro_dashboard',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// 🔥 MAİL AYARLARI 🔥
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'frtcbn65@gmail.com', 
        // ⚠️ 16 HANELİ ŞİFRENİ BURAYA YAZ
        pass: 'autm fxbz celj uzpr' 
    }
});

// 🔥 VERİTABANI BAĞLANTISI 🔥
const dbConfig = {
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           
    user: 'uzzt3cxlzejgx2x3',           
    password: 'cI3z7JLs2OHiQ23zOj4M',   
    database: 'b9jczsecmhesvtz8fkx0',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let db;
function handleDisconnect() {
    db = mysql.createPool(dbConfig);
    db.on('error', function(err) {
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}
handleDisconnect();

const autoFixDB = () => {
    db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) UNIQUE", (e)=>{});
    db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10)", (e)=>{});
};

const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// --- ROTALAR ---

app.get('/', (req, res) => {
    if (req.session.userId) res.redirect('/admin'); else res.redirect('/login'); 
});

app.get('/login', (req, res) => { autoFixDB(); res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if(err) return res.send("DB Hatası: " + err.message);
        if (results.length > 0) {
            const user = results[0];
            const passCheck = user.password || '$2a$10$dummy'; 
            const match = await bcrypt.compare(password, passCheck);
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.ad_soyad = user.ad_soyad;
                res.redirect('/admin');
            } else {
                res.send('<h1>Şifre Yanlış</h1><a href="/login">Geri</a>');
            }
        } else {
            res.send('<h1>Kullanıcı Yok</h1><a href="/login">Geri</a>');
        }
    });
});

app.get('/change-password', girisZorunlu, (req, res) => {
    res.render('change-password', { error: null, success: null });
});

app.post('/change-password-action', girisZorunlu, (req, res) => {
    const { old_password, new_password, confirm_password } = req.body;
    const userId = req.session.userId;
    if (new_password !== confirm_password) return res.render('change-password', { error: 'Şifreler uyuşmuyor', success: null });
    if (old_password === new_password) return res.render('change-password', { error: 'Yeni şifre eskisiyle aynı olamaz', success: null });

    db.query('SELECT * FROM users WHERE id = ?', [userId], async (err, results) => {
        const user = results[0];
        const match = await bcrypt.compare(old_password, user.password);
        if (!match) return res.render('change-password', { error: 'Eski şifre yanlış', success: null });

        const hashed = await bcrypt.hash(new_password, 10);
        db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId], () => {
            res.render('change-password', { error: null, success: 'Şifre güncellendi' });
        });
    });
});

app.get('/settings', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, result) => { 
        res.render('settings', { user: result[0] }); 
    });
});

app.post('/settings/update', girisZorunlu, upload.single('profil_resmi'), (req, res) => {
    const { username, ad_soyad, email } = req.body; 
    const userId = req.session.userId;
    let img = req.file ? '/images/'+req.file.filename : null;
    let sql = img ? "UPDATE users SET username=?, ad_soyad=?, email=?, resim_url=? WHERE id=?" : "UPDATE users SET username=?, ad_soyad=?, email=? WHERE id=?";
    let params = img ? [username, ad_soyad, email, img, userId] : [username, ad_soyad, email, userId];
    db.query(sql, params, () => {
        req.session.ad_soyad = ad_soyad; // Session'ı da güncelle
        res.redirect('/settings'); 
    });
});

// İSTATİSTİKLER SAYFASI (YENİ)
app.get('/stats', girisZorunlu, (req, res) => {
    // Şimdilik admin sayfasına yönlendirelim veya basit bir sayfa yapabiliriz.
    // Senin isteğin üzerine burayı aktif ettik, şimdilik "Yapım Aşamasında" diyebiliriz veya admin'e atabiliriz.
    res.send(`<h1 style="color:white; background:#0f172a; height:100vh; display:flex; justify-content:center; align-items:center;">📊 İstatistikler Çok Yakında... <a href="/admin" style="color:#6366f1; margin-left:20px;">Geri Dön</a></h1>`);
});

app.get('/forgot-password', (req, res) => { res.render('forgot-password'); });
app.post('/send-code', (req, res) => {
    // ... (Eski kodlar aynı) ...
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000); 
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if(results.length === 0) return res.send("<h1>Mail Yok</h1>");
        db.query('UPDATE users SET reset_code = ? WHERE email = ?', [code, email], () => {
            transporter.sendMail({from:'Serilink', to:email, subject:'Kod', text:String(code)}, (err) => {
                if(err) return res.send(`<h1>KODUN: ${code}</h1>`);
                res.render('verify-code', { email: email });
            });
        });
    });
});
app.post('/verify-code', (req, res) => {
    db.query('SELECT * FROM users WHERE email=? AND reset_code=?', [req.body.email, req.body.code], (e,r)=>{
        if(r.length>0) res.render('new-password', {email:req.body.email}); else res.send("Yanlış Kod");
    });
});
app.post('/reset-password-final', async (req, res) => {
    const hashed = await bcrypt.hash(req.body.new_password, 10);
    db.query('UPDATE users SET password=?, reset_code=NULL WHERE email=?', [hashed, req.body.email], ()=> res.redirect('/login'));
});

// ADMIN PANELİ (GÜNCELLENDİ: ARTIK KULLANICI BİLGİSİNİ DE GÖNDERİYORUZ)
app.get('/admin', girisZorunlu, (req, res) => {
    db.query(`SELECT u.*, COUNT(l.id) as link_sayisi FROM users u LEFT JOIN links l ON u.id = l.user_id GROUP BY u.id`, (err, results) => {
        res.render('admin', { 
            users: results, 
            activeId: req.session.userId,
            adminName: req.session.ad_soyad, // AD SOYAD BURADAN GİDİYOR
            adminUsername: req.session.username
        });
    });
});

app.get('/admin/:username', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE username=?', [req.params.username], (e,u)=> {
        db.query('SELECT * FROM links WHERE user_id=? ORDER BY id DESC', [u[0].id], (e,l)=> res.render('dashboard', {user:u[0], links:l}));
    });
});
app.get('/profile/:username', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE username=?', [req.params.username], (e,r)=> res.render('profile', {profile:r[0]}));
});
app.post('/add', girisZorunlu, (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username=?', [hidden_username], (e, r) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?,?,?,?)", [r[0].id, baslik, cleanUrl, platform||'web'], ()=> res.redirect('/admin/'+hidden_username));
    });
});
app.post('/admin/create-user', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], () => res.redirect('/admin'));
});
app.get('/admin/delete-user/:id', girisZorunlu, (req, res) => {
    if(req.params.id == req.session.userId) return res.send("Kendini silemezsin!");
    db.query('DELETE FROM links WHERE user_id = ?', [req.params.id], () => {
        db.query('DELETE FROM users WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
    });
});
app.get('/delete/:id', girisZorunlu, (req, res) => {
    const u = req.query.u;
    db.query('DELETE FROM links WHERE id=?', [req.params.id], () => res.redirect('/admin/'+u));
});
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','logout','add','edit','delete','settings','forgot-password','send-code','verify-code','reset-password-final','change-password','change-password-action','stats'].includes(k)) return;
    db.query('SELECT * FROM users WHERE username=?', [k], (e, u) => {
        if(!u || !u.length) return res.send("Kullanıcı yok");
        db.query('SELECT * FROM links WHERE user_id=? ORDER BY id DESC', [u[0].id], (err, l) => res.render('index', {profile:u[0], links:l}));
    });
});
app.get('/git/:id', (req, res) => {
    db.query("SELECT url FROM links WHERE id=?", [req.params.id], (e,r)=> res.redirect(r[0].url));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem Hazır!`));