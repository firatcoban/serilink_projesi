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

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/admin'); 
    } else {
        res.redirect('/login'); 
    }
});

// 2. GİRİŞ YAP
app.get('/login', (req, res) => { res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) return res.send(`<h1 style="color:red">DB HATASI!</h1><p>${err.message}</p>`);

        if (results.length > 0) {
            const user = results[0];
            
            // Eğer şifre sütunu yoksa veya veri boşsa
            if (!user.password) {
                return res.send(`<h1>HATA: Şifre sütunu eksik!</h1><br><a href="/onar">Zorla Onar</a>`);
            }

            const match = await bcrypt.compare(password, user.password);
            
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.ad_soyad = user.ad_soyad;
                req.session.save(() => res.redirect('/admin'));
            } else {
                res.send('<h1>Şifre Yanlış!</h1><br><a href="/login">Geri</a>');
            }
        } else {
            res.send('<h1>Kullanıcı Yok.</h1><br><a href="/login">Geri</a>');
        }
    });
});

// 3. KUMANDA MERKEZİ
app.get('/admin', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("Hata: " + err.message);
        res.render('admin', { users: results });
    });
});

// 4. KAYIT OL
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        // Hata verirse direkt ekrana basacağız
        db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
            [username, ad_soyad, hashed, '/images/logo.jpg'], 
            (err) => {
                if(err) return res.send(`<h1 style="color:red">KAYIT HATASI</h1><p>${err.message}</p><p>Lütfen <a href="/onar">/onar</a> sayfasına git.</p>`);
                res.redirect('/login');
            });
    } catch (error) {
        res.send("Sistem Hatası: " + error.message);
    }
});

// 5. SİSTEMİ ONAR (BALYOZ YÖNTEMİ 🔨)
app.get('/onar', async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);

    // 1. Önce Tabloyu Garantiye Al
    const createTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            ad_soyad VARCHAR(100),
            resim_url TEXT
        );
    `;

    // 2. Şifre Sütununu ZORLA Ekle (IF NOT EXISTS kullanmadan - Eski sürüm uyumlu)
    const addColumn = "ALTER TABLE users ADD password VARCHAR(255)";

    db.query(createTable, (err1) => {
        if (err1) return res.send("Tablo hatası: " + err1.message);

        // Sütunu eklemeyi dene
        db.query(addColumn, (err2) => {
            // Hata olsa bile (Sütun zaten varsa hata verir) devam ediyoruz.
            // Önemli olan sütunun orada olması.
            
            // Kullanıcıları ekle/güncelle
            const insertUser = `INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)`;
            
            db.query(insertUser, ['firat', 'Fırat Çoban', defaultHash, '/images/logo.jpg']);
            db.query(insertUser, ['bugra', 'Buğra Güzelsoy', defaultHash, '/images/logo.jpg'], () => {
                 res.send(`
                    <h1>✅ TAMİR EDİLDİ!</h1>
                    <p>Şifre sütunu zorla eklendi.</p>
                    <p>Fırat ve Buğra için şifre: <b>123456</b></p>
                    <br>
                    <a href="/login" style="font-size:20px;">👉 Giriş Yap</a>
                 `);
            });
        });
    });
});

// ... Diğer rotalar (logout, admin/:user, profile, vb.) ...
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

app.get('/admin/:username', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, r) => {
        if(!r.length) return res.send("Yok");
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [r[0].id], (e, l) => res.render('dashboard', {user:r[0], links:l}));
    });
});

app.get('/profile/:username', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    db.query('SELECT * FROM users WHERE username = ?', [req.params.username], (e, r) => res.render('profile', {profile:r[0]}));
});

app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username=?', [hidden_username], (e, r) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?,?,?,?)", [r[0].id, baslik, cleanUrl, platform||'web'], ()=> res.redirect('/admin/'+hidden_username));
    });
});

app.post('/edit/update', upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let img = req.file ? '/images/'+req.file.filename : null;
    let sql = img ? "UPDATE users SET ad_soyad=?, biyografi=?, resim_url=? WHERE username=?" : "UPDATE users SET ad_soyad=?, biyografi=? WHERE username=?";
    let p = img ? [ad_soyad, biyografi, img, hidden_username] : [ad_soyad, biyografi, hidden_username];
    db.query(sql, p, () => res.redirect('/profile/'+hidden_username));
});

app.get('/delete/:id', (req, res) => {
    const u = req.query.u;
    db.query('DELETE FROM links WHERE id=?', [req.params.id], () => res.redirect('/admin/'+u));
});

app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','register','logout','add','edit','delete','onar'].includes(k)) return;
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