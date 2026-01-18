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

// OTURUM AYARLARI
app.use(session({
    secret: 'gizli_anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 saat
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- VERİTABANI (POOL) ---
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

// GÜVENLİK KONTROLÜ
const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// --- ROTALAR ---

// 1. ANA SAYFA -> DİREKT LOGİN EKRANINA GİDER
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/admin'); // Zaten giriş yapmışsa panele
    } else {
        res.redirect('/login'); // Yapmamışsa logine
    }
});

// 2. GİRİŞ YAP
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (results.length > 0) {
            const user = results[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.userId = user.id;
                res.redirect('/admin'); // Şifre doğruysa "İki Butonlu" ekrana git
            } else {
                res.send('<h1>Şifre Yanlış</h1><a href="/login">Geri</a>');
            }
        } else {
            res.send('<h1>Kullanıcı Yok</h1><a href="/login">Geri</a>');
        }
    });
});

// 3. KAYIT OL
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
        [username, ad_soyad, hashed, '/images/logo.jpg'], 
        () => res.redirect('/login'));
});

// 4. ÇIKIŞ
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// 5. KUMANDA MERKEZİ (İKİ BUTONLU EKRAN) 🔥
app.get('/admin', girisZorunlu, (req, res) => {
    // Tüm kullanıcıları çekip buton olarak göstereceğiz
    db.query('SELECT * FROM users', (err, results) => {
        res.render('admin', { users: results });
    });
});

// 6. DASHBOARD (LİNKLER)
app.get('/admin/:username', girisZorunlu, (req, res) => {
    // Seçilen kullanıcının paneli açılır
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 7. PROFİL AYARLARI
app.get('/profile/:username', girisZorunlu, (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        res.render('profile', { profile: result[0] });
    });
});

// --- İŞLEMLER ---
app.post('/add', girisZorunlu, (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
            [result[0].id, baslik, cleanUrl, platform || 'web'], 
            () => res.redirect('/admin/' + hidden_username));
    });
});

app.post('/edit/update', girisZorunlu, upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE username = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE username = ?";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu, hidden_username] : [ad_soyad, biyografi, hidden_username];
    db.query(sql, params, () => res.redirect('/profile/' + hidden_username));
});

app.get('/delete/:id', girisZorunlu, (req, res) => {
    const username = req.query.u; 
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin/' + username));
});

// 8. ZİYARETÇİ PROFİLİ (Login gerekmez)
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    // Eğer admin, login, register gibi sistem sayfalarıysa çakışmayı önle
    if(['admin', 'login', 'register', 'logout', 'add', 'edit', 'delete'].includes(kadi)) return;

    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı bulunamadı.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem Başladı!`));