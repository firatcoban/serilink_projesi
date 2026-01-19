const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// OTURUM
app.use(session({
    secret: 'gizli_anahtar_serilink_v6',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// DB BAĞLANTISI (Senin Şifrelerin)
const db = mysql.createPool({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           
    user: 'uzzt3cxlzejgx2x3',           
    password: 'cI3z7JLs2OHiQ23zOj4M',   
    database: 'b9jczsecmhesvtz8fkx0',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// --- ROTALAR ---

app.get('/', (req, res) => {
    if (req.session.userId) res.redirect('/admin'); else res.redirect('/login'); 
});

app.get('/login', (req, res) => { res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if(err) return res.send("DB Hatası: " + err.message);
        if (results.length > 0) {
            const user = results[0];
            const passCheck = user.password || '$2a$10$dummy'; 
            if(!user.password) return res.redirect('/onar'); 

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

app.get('/admin', girisZorunlu, (req, res) => {
    const sql = `SELECT u.*, COUNT(l.id) as link_sayisi FROM users u LEFT JOIN links l ON u.id = l.user_id GROUP BY u.id`;
    db.query(sql, (err, results) => {
        if(err) return res.send("Admin Panel Hatası: " + err.message);
        res.render('admin', { users: results, activeId: req.session.userId });
    });
});

// 🔥 ŞİFRE SIFIRLAMA (ADMİN YETKİSİ) 🔥
app.get('/admin/reset-password/:id', girisZorunlu, async (req, res) => {
    // Güvenlik: Kimse adminin (senin) şifreni sıfırlayamasın
    if(req.params.id == req.session.userId) return res.send("<h1>Kendi şifreni buradan sıfırlayamazsın!</h1><a href='/settings'>Ayarlardan Değiştir</a>");

    const defaultHash = await bcrypt.hash("123456", 10);
    
    db.query("UPDATE users SET password = ? WHERE id = ?", [defaultHash, req.params.id], (err) => {
        if(err) return res.send("Hata: " + err.message);
        
        // İşlem bitince geri dön ama URL'ye 'reset=ok' ekle ki uyarı gösterelim
        res.redirect('/admin?msg=sifre_sifirlandi');
    });
});

// 🔥🔥🔥 DEDEKTİF MODU: AYARLAR SAYFASI 🔥🔥🔥
app.get('/settings', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, result) => {
        if(err) return res.send("Veritabanı Hatası: " + err.message);
        
        // Render hatasını yakalamak için özel kontrol
        res.render('settings', { user: result[0] }, (renderErr, html) => {
            if (renderErr) {
                return res.send(`
                    <h1 style="color:red">SAYFA BULUNAMADI! (settings.ejs)</h1>
                    <p>Sunucu 'views/settings.ejs' dosyasını bulamıyor veya içinde hata var.</p>
                    <hr>
                    <p><b>Hata Detayı:</b> ${renderErr.message}</p>
                    <p><b>Çözüm:</b> 'views' klasörünün içinde 'settings.ejs' adında bir dosya oluşturduğundan emin ol.</p>
                `);
            }
            res.send(html);
        });
    });
});

app.post('/settings/update', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const userId = req.session.userId;

    if (password && password.trim() !== "") {
        const hashed = await bcrypt.hash(password, 10);
        const sql = "UPDATE users SET username = ?, ad_soyad = ?, password = ? WHERE id = ?";
        db.query(sql, [username, ad_soyad, hashed, userId], (err) => {
            if(err) return res.send("Güncelleme Hatası: " + err.message);
            req.session.username = username;
            req.session.ad_soyad = ad_soyad;
            res.redirect('/admin');
        });
    } else {
        const sql = "UPDATE users SET username = ?, ad_soyad = ? WHERE id = ?";
        db.query(sql, [username, ad_soyad, userId], (err) => {
            if(err) return res.send("Güncelleme Hatası: " + err.message);
            req.session.username = username;
            req.session.ad_soyad = ad_soyad;
            res.redirect('/admin');
        });
    }
});

app.get('/admin/:username', girisZorunlu, (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

app.get('/profile/:username', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE username = ?', [req.params.username], (err, result) => {
        res.render('profile', { profile: result[0] });
    });
});

app.post('/admin/create-user', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
        [username, ad_soyad, hashed, '/images/logo.jpg'], 
        (err) => { if(err) return res.send("Hata: "+err.message); res.redirect('/admin'); });
});

app.get('/admin/delete-user/:id', girisZorunlu, (req, res) => {
    if(req.params.id == req.session.userId) return res.send("Kendini silemezsin!");
    db.query('DELETE FROM links WHERE user_id = ?', [req.params.id], () => {
        db.query('DELETE FROM users WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
    });
});

app.post('/add', girisZorunlu, (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username=?', [hidden_username], (e, r) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?,?,?,?)", [r[0].id, baslik, cleanUrl, platform||'web'], ()=> res.redirect('/admin/'+hidden_username));
    });
});

app.post('/edit/update', girisZorunlu, upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let img = req.file ? '/images/'+req.file.filename : null;
    let sql = img ? "UPDATE users SET ad_soyad=?, biyografi=?, resim_url=? WHERE username=?" : "UPDATE users SET ad_soyad=?, biyografi=? WHERE username=?";
    let p = img ? [ad_soyad, biyografi, img, hidden_username] : [ad_soyad, biyografi, hidden_username];
    db.query(sql, p, () => res.redirect('/profile/'+hidden_username));
});

app.get('/delete/:id', girisZorunlu, (req, res) => {
    const u = req.query.u;
    db.query('DELETE FROM links WHERE id=?', [req.params.id], () => res.redirect('/admin/'+u));
});

app.get('/onar', async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    db.query("UPDATE users SET password = ? WHERE password IS NULL OR password = ''", [defaultHash], () => {
        res.send("<h1>✅ ONARILDI</h1><a href='/login'>Giriş</a>");
    });
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], ()=> res.redirect('/login'));
});

app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','register','logout','add','edit','delete','onar','settings'].includes(k)) return;
    db.query('SELECT * FROM users WHERE username=?', [k], (e, u) => {
        if(!u || !u.length) return res.send("Kullanıcı yok");
        db.query('SELECT * FROM links WHERE user_id=? ORDER BY id DESC', [u[0].id], (err, l) => res.render('index', {profile:u[0], links:l}));
    });
});

app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url); else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem Hazır!`));