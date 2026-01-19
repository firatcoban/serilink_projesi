const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer'); // Postacı paketi

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// OTURUM
app.use(session({
    secret: 'gizli_anahtar_serilink_v8_email',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// 🔥 E-POSTA AYARLARI (BURAYI KENDİ BİLGİLERİNLE DOLDUR) 🔥
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'frtcbn65@gmail.com', // Örn: firatcoban@gmail.com
        pass: 'bugüzelsoy' // Örn: xxxx xxxx xxxx xxxx
    }
});

// DB BAĞLANTISI
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

// 🔥 ŞİFREMİ UNUTTUM AKIŞI 🔥

// 1. E-posta Girme Ekranı
app.get('/forgot-password', (req, res) => { res.render('forgot-password'); });

// 2. Kod Gönderme
app.post('/send-code', (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000); // 6 haneli kod

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if(results.length === 0) return res.send(`
            <div style="text-align:center; padding:50px; font-family:sans-serif; background:#0f172a; color:white; height:100vh;">
                <h1>❌ Hata</h1>
                <p>Bu e-posta adresi sistemde kayıtlı değil.</p>
                <a href="/forgot-password" style="color:#FF5400;">Tekrar Dene</a>
            </div>
        `);

        db.query('UPDATE users SET reset_code = ? WHERE email = ?', [code, email], (err) => {
            const mailOptions = {
                from: 'Serilink Güvenlik',
                to: email,
                subject: '🔑 Şifre Sıfırlama Kodun',
                html: `
                    <div style="background:#f4f4f4; padding:20px; text-align:center;">
                        <h2>Şifreni mi unuttun?</h2>
                        <p>Aşağıdaki kodu girerek şifreni sıfırlayabilirsin:</p>
                        <h1 style="color:#FF5400; font-size:40px; letter-spacing:5px;">${code}</h1>
                        <p>Bu kodu kimseyle paylaşma.</p>
                    </div>
                `
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    return res.send("<h1>E-posta Gönderilemedi!</h1><p>Server.js dosyasındaki Gmail bilgilerini kontrol et.</p>");
                }
                res.render('verify-code', { email: email });
            });
        });
    });
});

// 3. Kod Doğrulama
app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND reset_code = ?', [email, code], (err, results) => {
        if(results.length > 0) {
            res.render('new-password', { email: email });
        } else {
            res.send(`
                <div style="text-align:center; padding:50px; font-family:sans-serif; background:#0f172a; color:white; height:100vh;">
                    <h1>❌ Yanlış Kod</h1>
                    <p>Girdiğin kod hatalı veya süresi dolmuş.</p>
                    <a href="/forgot-password" style="color:#FF5400;">Başa Dön</a>
                </div>
            `);
        }
    });
});

// 4. Yeni Şifreyi Kaydet
app.post('/reset-password-final', async (req, res) => {
    const { email, new_password } = req.body;
    const hashed = await bcrypt.hash(new_password, 10);
    
    db.query('UPDATE users SET password = ?, reset_code = NULL WHERE email = ?', [hashed, email], (err) => {
        res.send(`
            <div style="text-align:center; padding:50px; font-family:sans-serif; background:#0f172a; color:white; height:100vh;">
                <h1>✅ Başarılı!</h1>
                <p>Şifren başarıyla değiştirildi.</p>
                <a href="/login" style="background:#28a745; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Giriş Yap</a>
            </div>
        `);
    });
});

// YÖNETİM MERKEZİ
app.get('/admin', girisZorunlu, (req, res) => {
    const sql = `SELECT u.*, COUNT(l.id) as link_sayisi FROM users u LEFT JOIN links l ON u.id = l.user_id GROUP BY u.id`;
    db.query(sql, (err, results) => {
        res.render('admin', { users: results, activeId: req.session.userId });
    });
});

// 🔥 AYARLAR SAYFASI (E-POSTA VE ŞİFRE GÜNCELLEME) 🔥
app.get('/settings', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, result) => {
        res.render('settings', { user: result[0] });
    });
});

app.post('/settings/update', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, email, password } = req.body;
    const userId = req.session.userId;

    let sql = "";
    let params = [];

    if (password && password.trim() !== "") {
        // Şifre de değişecek
        const hashed = await bcrypt.hash(password, 10);
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ?, password = ? WHERE id = ?";
        params = [username, ad_soyad, email, hashed, userId];
    } else {
        // Sadece bilgiler değişecek
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ? WHERE id = ?";
        params = [username, ad_soyad, email, userId];
    }

    db.query(sql, params, (err) => {
        if(err) return res.send("Güncelleme Hatası: " + err.message);
        req.session.username = username;
        req.session.ad_soyad = ad_soyad;
        res.redirect('/admin');
    });
});

// SİSTEM ONARIM (E-POSTA SÜTUNU EKLER)
app.get('/onar', async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    const createSql = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            ad_soyad VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            password VARCHAR(255),
            reset_code VARCHAR(10),
            resim_url TEXT
        );`;
    const alterEmail = "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) UNIQUE;";
    const alterCode = "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);";
    
    db.query(createSql, () => {
        db.query(alterEmail, () => {
            db.query(alterCode, () => {
                db.query("UPDATE users SET password = ? WHERE password IS NULL OR password = ''", [defaultHash], () => {
                    res.send("<h1>✅ SİSTEM GÜNCELLENDİ!</h1><p>E-posta özellikleri eklendi.</p><a href='/settings'>Hemen E-postanı Tanımla!</a>");
                });
            });
        });
    });
});

// DİĞER ROTALAR
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
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], () => res.redirect('/admin'));
});
app.get('/admin/delete-user/:id', girisZorunlu, (req, res) => {
    if(req.params.id == req.session.userId) return res.send("Kendini silemezsin!");
    db.query('DELETE FROM links WHERE user_id = ?', [req.params.id], () => {
        db.query('DELETE FROM users WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
    });
});
app.get('/admin/reset-password/:id', girisZorunlu, async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    db.query("UPDATE users SET password = ? WHERE id = ?", [defaultHash, req.params.id], () => res.redirect('/admin'));
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
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], ()=> res.redirect('/login'));
});
app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','register','logout','add','edit','delete','onar','settings', 'forgot-password', 'send-code', 'verify-code', 'reset-password-final'].includes(k)) return;
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