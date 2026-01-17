-- 1. Önce eski tabloları ve kalıntıları temizle (Hata almamak için)
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS profile;

-- 2. PROFİL TABLOSUNU OLUŞTUR (Adın, Biyografin ve Resmin için)
CREATE TABLE profile (
    id INT PRIMARY KEY,
    ad_soyad VARCHAR(100),
    biyografi TEXT,
    resim_url TEXT
);

-- Profil için başlangıç verisini ekle (Bunu yapmazsak site açılmaz)
INSERT INTO profile (id, ad_soyad, biyografi, resim_url)
VALUES (1, 'Buğra Güzelsoy', 'Sungoku enerjisi ile kalın 🔥', '/images/logo.jpg');

-- 3. LİNK TABLOSUNU OLUŞTUR
CREATE TABLE links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    platform VARCHAR(50) DEFAULT 'web',
    tiklanma_sayisi INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. LİNKLERİ EKLE (Doğru İkon ve Başlıklarla)
INSERT INTO links (title, url, platform, tiklanma_sayisi) VALUES 
('Bu Güzelsoy - YouTube', 'https://www.youtube.com/@buguzelsoy', 'youtube', 0),
('Bu Güzelsoy Games 🎮 - YouTube', 'https://www.youtube.com/@buguzelsoygames', 'youtube', 0),
('Bu Güzelsoy - Instagram', 'https://www.instagram.com/buguzelsoy', 'instagram', 0),
('Bu Güzelsoy - TikTok', 'https://www.tiktok.com/@buguzelsoy', 'tiktok', 0),
('Bu Güzelsoy - X', 'https://x.com/buguzelsoy', 'x', 0),
('Bu Güzelsoy - Kick', 'https://kick.com/buguzelsoy', 'kick', 0),
('Bu Güzelsoy - Twitch', 'https://www.twitch.tv/buguzelsoy', 'twitch', 0),
('Bu Güzelsoy - Discord', 'https://discord.gg/SfFWKM8vZv', 'discord', 0);

-- 5. Sonuçları Göster (İşlem Tamam mı Diye Bak)
SELECT * FROM links;
SELECT * FROM profile;