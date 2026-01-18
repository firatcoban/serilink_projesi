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
    
    // Veritabanı sorgusu
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        // HATA VARSA YAKALA VE EKRANA BAS (BEYAZ SAYFAYI ENGELLER)
        if (err) {
            return res.send(`<h1 style="color:red">VERİTABANI HATASI!</h1><p>${err.message}</p><p>Lütfen server.js dosyasındaki şifreleri kontrol et.</p>`);
        }

        if (results.length > 0) {
            const user = results[0];
            
            // Eğer veritabanında şifre yoksa (eski kayıt)
            if (!user.password) {
                return res.send(`<h1>HATA: Bu kullanıcının şifresi yok.</h1><br><a href="/onar">Sistemi Onar</a>`);
            }

            // Şifre kontrolü
            const match = await bcrypt.compare(password, user.password);
            
            if (match) {
                // Oturum aç
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.ad_soyad = user.ad_soyad;

                // Oturumu kaydet ve yönlendir
                req.session.save((err) => {
                    if (err) return res.send("Oturum kaydetme hatası: " + err.message);
                    res.redirect('/admin'); 
                });
            } else {
                res.send('<h1>Şifre Yanlış!</h1><br><a href="/login">Tekrar Dene</a>');
            }
        } else {
            res.send('<h1>Böyle bir kullanıcı bulunamadı.</h1><br><a href="/login">Tekrar Dene</a>');
        }
    });
});

// 3. KUMANDA MERKEZİ (İKİ BUTONLU EKRAN)
app.get('/admin', (req, res) => {
    // Giriş yapmamışsa logine at
    if (!req.session.userId) return res.redirect('/login');

    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("Admin Paneli Hatası: " + err.message);
        
        // EJS Render hatasını yakalamak için try-catch
        try {
            res.render('admin', { users: results });
        } catch (renderError) {
            res.send(`<h1 style="color:red">TASARIM HATASI (admin.ejs)</h1><pre>${renderError.message}</pre>`);
        }
    });
});

// 4. KAYIT OL
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
            [username, ad_soyad, hashed, '/images/logo.jpg'], 
            (err) => {
                if(err) return res.send("Kayıt Hatası: " + err.message);
                res.redirect('/login');
            });
    } catch (error) {
        res.send("Sistem Hatası: " + error.message);
    }
});

// 5. ÇIKIŞ
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// 6. DASHBOARD
app.get('/admin/:username', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
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
app.get('/profile/:username', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        res.render('profile', { profile: result[0] });
    });
});

// 8. SİSTEMİ ONAR (ŞİFRE SÜTUNU EKLER)
app.get('/onar', async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    const sql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);";
    
    db.query(sql, (err) => {
        // Kullanıcıları güncelle/ekle
        const insertUser = `INSERT INTO users (id, username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)`;
        db.query(insertUser, [1, 'firat', 'Fırat Çoban', defaultHash, '/images/logo.jpg']);
        db.query(insertUser, [2, 'BuGüzelsoy', 'Buğra Güzelsoy', defaultHash, '/images/logo.jpg'], () => {
             res.send("<h1>✅ SİSTEM ONARILDI!</h1><p>Şifre sütunu eklendi, kullanıcılar güncellendi. Şifre: 123456</p><a href='/login'>Giriş Yap</a>");
        });
    });
});

// 9. GENEL HATA YAKALAYICI (EN ALTA EKLENİR)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(`<h1 style="color:red">💥 SUNUCU HATASI!</h1><p>${err.message}</p>`);
});

// ... Diğer işlem rotaları (add, edit, delete, git) ...
app.post('/add', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
            [result[0].id, baslik, cleanUrl, platform || 'web'], 
            () => res.redirect('/admin/' + hidden_username));
    });
});

app.post('/edit/update', upload.single('profil_resmi'), (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE username = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE username = ?";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu, hidden_username] : [ad_soyad, biyografi, hidden_username];
    db.query(sql, params, () => res.redirect('/profile/' + hidden_username));
});

app.get('/delete/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const username = req.query.u; 
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin/' + username));
});

app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    if(['admin', 'login', 'register', 'logout', 'add', 'edit', 'delete', 'onar', 'git'].includes(kadi)) return;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult || !userResult.length) return res.send("Kullanıcı bulunamadı.");
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
app.listen(PORT, () => console.log(`🚀 Sistem Hazır!`));