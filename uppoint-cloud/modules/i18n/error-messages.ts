import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";

export interface LocalizedErrorMessages {
  errorLabel: string;
  unexpectedErrorTitle: string;
  somethingWentWrongTitle: string;
  staleActionTitle: string;
  notFoundTitle: string;
  notFoundDescription: string;
  retry: string;
  refreshPage: string;
  codePrefix: string;
  fallbackDescription: string;
  staleActionDescription: string;
  backToLogin: string;
}

const ERROR_MESSAGES: Record<Locale, LocalizedErrorMessages> = {
  tr: {
    errorLabel: "Hata",
    unexpectedErrorTitle: "Beklenmeyen bir hata oluştu",
    somethingWentWrongTitle: "Bir şeyler yanlış gitti",
    staleActionTitle: "Oturum güncellendi",
    notFoundTitle: "Sayfa bulunamadı",
    notFoundDescription: "Aradığınız sayfa mevcut değil veya taşınmış olabilir.",
    retry: "Tekrar dene",
    refreshPage: "Sayfayı yenile",
    codePrefix: "Hata kodu",
    fallbackDescription: "Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.",
    staleActionDescription: "Sistem yeni bir sürüme geçti. Devam etmek için sayfayı yenileyin.",
    backToLogin: "Giriş sayfasına dön",
  },
  en: {
    errorLabel: "Error",
    unexpectedErrorTitle: "An unexpected error occurred",
    somethingWentWrongTitle: "Something went wrong",
    staleActionTitle: "Session updated",
    notFoundTitle: "Page not found",
    notFoundDescription: "The page you are looking for does not exist or may have moved.",
    retry: "Try again",
    refreshPage: "Refresh page",
    codePrefix: "Error code",
    fallbackDescription: "Please refresh the page or try again later.",
    staleActionDescription: "A newer deployment is active. Refresh the page to continue.",
    backToLogin: "Back to login",
  },
};

export function resolveLocaleFromPathname(pathname: string | null | undefined): Locale {
  if (!pathname) {
    return defaultLocale;
  }

  const [, maybeLocale] = pathname.split("/");
  if (maybeLocale && isLocale(maybeLocale)) {
    return maybeLocale;
  }

  return defaultLocale;
}

export function getErrorMessages(locale: Locale): LocalizedErrorMessages {
  return ERROR_MESSAGES[locale];
}
