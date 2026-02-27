export const trMessages = {
  metadata: {
    title: "Uppoint Cloud",
    description: "cloud.uppoint.com.tr icin uretim odakli bulut platform temeli",
  },
  home: {
    domain: "cloud.uppoint.com.tr",
    title: "Kimlik Dogrulama MVP Temeli",
    description:
      "Kayit, giris, cikis, korumali panel yonlendirmesi ve uretim sunum yapisi bu kilometre tasinda hazirlandi.",
    cta: {
      dashboard: "Panele git",
      signIn: "Giris yap",
      register: "Hesap olustur",
    },
  },
  login: {
    title: "Giris yap",
    description: "cloud.uppoint.com.tr calisma alanina eris",
    footerPrefix: "Hesabin yok mu?",
    footerLink: "Hesap olustur",
    fields: {
      email: "E-posta",
      password: "Sifre",
    },
    submitIdle: "Giris yap",
    submitLoading: "Giris yapiliyor...",
    errors: {
      unavailable: "Su anda giris yapilamiyor",
      invalidCredentials: "E-posta veya sifre hatali",
    },
  },
  register: {
    title: "Hesap olustur",
    description: "cloud.uppoint.com.tr erisimi icin kayit ol",
    footerPrefix: "Zaten hesabin var mi?",
    footerLink: "Giris yap",
    fields: {
      name: "Ad soyad",
      email: "E-posta",
      phone: "Telefon (opsiyonel)",
      phonePlaceholder: "+905551112233",
      password: "Sifre",
    },
    submitIdle: "Hesap olustur",
    submitLoading: "Hesap olusturuluyor...",
    errors: {
      serverUnavailable: "Sunucuya baglanilamiyor",
      generic: "Hesap olusturulamadi",
      autoSignInFailed: "Hesap olustu, otomatik giris basarisiz",
      emailTaken: "Bu e-posta ile kayitli bir hesap zaten var",
      validationFailed: "Gonderilen bilgiler gecersiz",
      invalidBody: "Gecersiz istek govdesi",
    },
  },
  dashboard: {
    title: "Panel",
    description: "Sonraki VPS platform ozellikleri icin kimligi dogrulanmis yer tutucu sayfa.",
    cardTitle: "Kimligi dogrulanmis oturum aktif",
    cardDescriptionPrefix: "Su hesapla giris yaptin:",
    cardContent:
      "Bu sayfa, kimlik dogrulama MVP kilometre tasi icin bilerek minimal tutulmustur.",
  },
  logout: {
    button: "Cikis yap",
  },
  validation: {
    phoneFormat: "Telefon uluslararasi formatta olmalidir",
    passwordMin: "Sifre en az 12 karakter olmali",
    passwordMax: "Sifre en fazla 72 karakter olmali",
    passwordLowercase: "Sifre en az bir kucuk harf icermeli",
    passwordUppercase: "Sifre en az bir buyuk harf icermeli",
    passwordNumber: "Sifre en az bir rakam icermeli",
    passwordSymbol: "Sifre en az bir sembol icermeli",
    nameMin: "Ad soyad en az 2 karakter olmali",
    loginPasswordRequired: "Sifre zorunludur",
  },
  apiErrors: {
    invalidBody: "INVALID_BODY",
    validationFailed: "VALIDATION_FAILED",
    emailTaken: "EMAIL_TAKEN",
    registerFailed: "REGISTER_FAILED",
  },
} as const;
