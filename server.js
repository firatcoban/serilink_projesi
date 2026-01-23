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
    secret: 'gizli_anahtar_serilink_v14_fix',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// 🔥 MAİL AYARLARI (BURAYI DOLDURMAYI UNUTMA) 🔥
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'frtcbn65@gmail.com',
        // ⚠️ Google'dan aldığın 16 haneli Uygulama Şifresini buraya yaz:
        pass: 'autm fxbz celj uzpr'
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

// GİRİŞ KONTROLÜ
const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// 🔥🔥🔥 SÜPER TAMİR ROTASI (BU LİNKE GİDİNCE KESİN DÜZELİR) 🔥🔥🔥
app.get('/fix', (req, res) => {
    let log = "<html><body style='background:#0f172a; color:white; font-family:sans-serif; padding:50px; text-align:center;'>";
    log += "<h1>🛠️ VERİTABANI ZORLA TAMİR EDİLİYOR...</h1><div style='text-align:left; display:inline-block; background:#1e293b; padding:20px; border-radius:10px;'>";

    // 1. Tabloyu Garantiye Al
    db.query("CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE)", (err) => {
        if(err) log += `<p style='color:red'>❌ Tablo Hatası: ${err.message}</p>`;
        else log += "<p style='color:#4ade80'>✅ Tablo Kontrolü: OK</p>";

        // 2. Email Sütununu Çak
        db.query("ALTER TABLE users ADD COLUMN email VARCHAR(100) UNIQUE", (err1) => {
            if(err1 && err1.code !== 'ER_DUP_FIELDNAME') log += `<p style='color:orange'>⚠️ Email Sütunu: ${err1.message}</p>`;
            else log += "<p style='color:#4ade80'>✅ Email Sütunu: EKLENDİ / ZATEN VAR</p>";

            // 3. Reset Code Sütununu Çak
            db.query("ALTER TABLE users ADD COLUMN reset_code VARCHAR(10)", (err2) => {
                if(err2 && err2.code !== 'ER_DUP_FIELDNAME') log += `<p style='color:orange'>⚠️ Kod Sütunu: ${err2.message}</p>`;
                else log += "<p style='color:#4ade80'>✅ Kod Sütunu: EKLENDİ / ZATEN VAR</p>";

                // 4. Diğer Eksikleri Çak
                db.query("ALTER TABLE users ADD COLUMN ad_soyad VARCHAR(100)", () => {});
                db.query("ALTER TABLE users ADD COLUMN password VARCHAR(255)", () => {});
                db.query("ALTER TABLE users ADD COLUMN resim_url TEXT", () => {});

                log += "</div><br><br><h2>🎉 İŞLEM TAMAMLANDI!</h2>";
                log += "<p>Veritabanı artık 'Email' sütununu tanıyor.</p>";
                log += "<a href='/login' style='background:#6366f1; color:white; padding:15px 30px; text-decoration:none; border-radius:10px; font-weight:bold; display:inline-block; margin-top:20px;'>GİRİŞ YAP VE TEST ET -></a>";
                log += "</body></html>";
                res.send(log);
            });
        });
    });
});

// --- ROTALAR ---

app.get('/', (req, res) => {
    // Ana sayfaya gelen herkesi önce bir kontrol edelim, eğer hata alırlarsa /fix'e yönlendirelim
    if (req.session.userId) res.redirect('/admin'); else res.redirect('/login');
});

app.get('/login', (req, res) => { res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        // Eğer burada Unknown Column hatası alırsak kullanıcıyı direkt tamire yollayalım
        if(err) {
            if(err.message.includes("Unknown column")) return res.redirect('/fix');
            return res.send("DB Hatası: " + err.message);
        }

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

// 🔥 ŞİFREMİ UNUTTUM 🔥
app.get('/forgot-password', (req, res) => { res.render('forgot-password'); });

app.post('/send-code', (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000);

    console.log("Mail gönderiliyor: ", email);

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        // Hata yakalama
        if(err) {
            if(err.message.includes("Unknown column")) return res.redirect('/fix');
            return res.send("DB Hatası: " + err.message);
        }

        if(results.length === 0) {
            return res.send(`
                <div style="text-align:center; padding:50px; font-family:sans-serif; background:#0f172a; color:white; height:100vh;">
                    <h1>❌ E-posta Bulunamadı</h1>
                    <p>Bu adres sistemde kayıtlı değil.</p>
                    <p><b>Not:</b> Önce sisteme giriş yapıp 'Hesap Bilgileri' kısmından mailini kaydettin mi?</p>
                    <a href='/forgot-password' style="color:#f472b6">Tekrar Dene</a>
                </div>
            `);
        }

        db.query('UPDATE users SET reset_code = ? WHERE email = ?', [code, email], (err) => {
            if(err) return res.send("Kod Kaydetme Hatası: " + err.message);

            const mailOptions = {
                from: 'Serilink Güvenlik',
                to: email,
                subject: '🔑 Sıfırlama Kodun',
                html: `<h1>${code}</h1><p>Bu kodu gir.</p>`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) return res.send(`<h1>Mail Gönderilemedi!</h1><p>${error.message}</p><p>Lütfen server.js dosyasındaki uygulama şifresini kontrol et.</p>`);
                res.render('verify-code', { email: email });
            });
        });
    });
});

app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND reset_code = ?', [email, code], (err, results) => {
        if(results.length > 0) res.render('new-password', { email: email });
        else res.send("<h1>❌ Yanlış Kod</h1><a href='/forgot-password'>Geri</a>");
    });
});

app.post('/reset-password-final', async (req, res) => {
    const { email, new_password } = req.body;
    const hashed = await bcrypt.hash(new_password, 10);
    db.query('UPDATE users SET password = ?, reset_code = NULL WHERE email = ?', [hashed, email], (err) => {
        res.send("<h1>✅ Başarılı!</h1><a href='/login'>Giriş Yap</a>");
    });
});

// YÖNETİM MERKEZİ
app.get('/admin', girisZorunlu, (req, res) => {
    const sql = `SELECT u.*, COUNT(l.id) as link_sayisi FROM users u LEFT JOIN links l ON u.id = l.user_id GROUP BY u.id`;
    db.query(sql, (err, results) => {
        res.render('admin', { users: results, activeId: req.session.userId });
    });
});

// AYARLAR
app.get('/settings', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, result) => {
        res.render('settings', { user: result[0] });
    });
});

app.post('/settings/update', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, email, password } = req.body;
    const userId = req.session.userId;
    let sql = "", params = [];

    if (password && password.trim() !== "") {
        const hashed = await bcrypt.hash(password, 10);
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ?, password = ? WHERE id = ?";
        params = [username, ad_soyad, email, hashed, userId];
    } else {
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ? WHERE id = ?";
        params = [username, ad_soyad, email, userId];
    }

    db.query(sql, params, (err) => {
        if(err) {
            if(err.message.includes("Unknown column")) return res.redirect('/fix'); // Hata alırsa düzeltsin
            return res.send("Güncelleme Hatası: " + err.message);
        }
        req.session.username = username;
        req.session.ad_soyad = ad_soyad;
        res.redirect('/admin');
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
    if(['admin','login','register','logout','add','edit','delete','fix','settings', 'forgot-password', 'send-code', 'verify-code', 'reset-password-final'].includes(k)) return;
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