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
    secret: 'gizli_anahtar_serilink',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// ⚠️⚠️⚠️ DİKKAT: BURAYI KENDİ BİLGİLERİNLE DOLDUR! ⚠️⚠️⚠️
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


// GÜVENLİK
const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    if (req.session.userId) res.redirect('/admin'); 
    else res.redirect('/login'); 
});

// 2. GİRİŞ YAP
app.get('/login', (req, res) => { res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) return res.send(`<h1 style="color:red">DB HATASI</h1><p>${err.message}</p>`);
        if (results.length > 0) {
            const user = results[0];
            // Eğer şifre yoksa (eski kayıt)
            if (!user.password) return res.send(`<h1>HATA: Şifre yok!</h1><br><a href="/onar">Şifre Oluştur</a>`);

            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.ad_soyad = user.ad_soyad;
                res.redirect('/admin');
            } else {
                res.send('<h1>Şifre Yanlış</h1><br><a href="/login">Geri</a>');
            }
        } else {
            res.send('<h1>Kullanıcı Yok</h1><br><a href="/login">Geri</a>');
        }
    });
});

// 3. KUMANDA MERKEZİ (SEÇİM VE EKLEME EKRANI)
app.get('/admin', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        res.render('admin', { users: results });
    });
});

// 4. YENİ KULLANICI EKLE (ADMİN PANELİNDEN)
app.post('/admin/create-user', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
            [username, ad_soyad, hashed, '/images/logo.jpg'], 
            (err) => {
                if(err) return res.send("Hata: " + err.message);
                res.redirect('/admin'); // Panele geri dön
            });
    } catch (error) {
        res.send("Hata: " + error.message);
    }
});

// 5. KULLANICI SİL (ADMİN PANELİNDEN)
app.get('/admin/delete-user/:id', girisZorunlu, (req, res) => {
    // Kendini silemezsin (Güvenlik)
    if(req.params.id == req.session.userId) return res.send("Kendini silemezsin!");
    
    db.query('DELETE FROM users WHERE id = ?', [req.params.id], () => {
        res.redirect('/admin');
    });
});

// 6. DASHBOARD (LİNKLER)
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

// 7. ÖZEL TEMİZLİK (İSTEĞİN ÜZERİNE) 🧹
app.get('/temizle', (req, res) => {
    // Linki OLMAYAN herkesi ve 'firat' kullanıcısını sil.
    // Sadece link eklemiş olan gerçek 'Buğra' kalacak.
    const sql = `
        DELETE FROM users 
        WHERE username = 'firat' 
        OR id NOT IN (SELECT DISTINCT user_id FROM links);
    `;
    db.query(sql, (err) => {
        if(err) return res.send("Hata: " + err.message);
        res.send(`
            <h1>🧹 GEREKSİZLER SİLİNDİ!</h1>
            <p>Sadece linki olan dolu profiller (Buğra) kaldı.</p>
            <p>Boş profiller ve Fırat silindi.</p>
            <br><a href="/login">Giriş Yap</a>
        `);
    });
});

// 8. ONARIM (ŞİFRE SÜTUNU GARANTİSİ)
app.get('/onar', async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    // Sütun yoksa ekle
    const sql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);";
    db.query(sql, () => {
        // Mevcut kullanıcılara şifre ata (eğer boşsa)
        db.query("UPDATE users SET password = ? WHERE password IS NULL OR password = ''", [defaultHash], () => {
            res.send("<h1>✅ SİSTEM ONARILDI</h1><a href='/login'>Giriş Yap</a>");
        });
    });
});

// ... DİĞER ROTALAR (Aynı kaldı) ...
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    /* Kayıt kodu buraya */ 
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], ()=> res.redirect('/login'));
});
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

app.get('/profile/:username', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE username = ?', [req.params.username], (e, r) => res.render('profile', {profile:r[0]}));
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
app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','register','logout','add','edit','delete','onar','temizle'].includes(k)) return;
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