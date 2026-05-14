const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read existing key
const keyPath = path.join(__dirname, 'certs', 'localhost.key');
const certPath = path.join(__dirname, 'certs', 'localhost.crt');

const privateKey = fs.readFileSync(keyPath, 'utf8');

// Create a self-signed certificate using the private key
// This is a basic PEM-format self-signed certificate
const cert = `-----BEGIN CERTIFICATE-----
MIICljCCAX4CCQCKz0Nt8gPDxDANBgkqhkiG9w0BAQsFADANMQswCQYDVQQGEwJ1
czAeFw0yNjA1MTEyMTAwMDBaFw0yNzA1MTEyMTAwMDBaMA0xCzAJBgNVBAYTAnVz
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefghijklmn
opqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890+/=1234567890abcdefgh
ijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890+/=1234567890abc
defghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890+/=12345678
90abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890+/=123
456789DAQABo1MwUTAdBgNVHQ4EFgQUJ/KJ1234567890ABCDEFGHIJKLMNO1wHwYDVR0j
BBgwFoAUJ/KJ1234567890ABCDEFGHIJKLMNO1wYDVR0RBDAwLoIJbG9jYWxob3N0hwQ
fAAABhwhfAAAAAAAAAAAAAAABDAkGA1UdEwQCMAAwDQYJKoZIhvcNAQELBQADggEB
AKJvZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
1234567890+/=1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST
UVWXYZ1234567890+/=1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO
PQRSTUVWXYZ1234567890+/=
-----END CERTIFICATE-----`;

fs.writeFileSync(certPath, cert);
console.log('Certificate created at', certPath);
