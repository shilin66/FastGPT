var key = "Zenlayer20180319";  // 与加密时相同的密钥
var keyHex = CryptoJS.enc.Utf8.parse(key);

// 假设 password 是加密后的 Base64 字符串
var encryptedPassword = "hzf47mTyWL7EOwWoX7ZTQiLT5FLWcCkj";

// 1. 将 Base64 字符串解析为 CipherParams 对象
var cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(encryptedPassword)
});

// 2. 执行解密
var decrypted = CryptoJS.DES.decrypt(cipherParams, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
});

// 3. 将解密得到的 WordArray 转为 UTF-8 字符串
var originalPassword = decrypted.toString(CryptoJS.enc.Utf8);

console.log("解密后的原始密码：", originalPassword);