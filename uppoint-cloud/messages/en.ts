export const enMessages = {
  metadata: {
    title: "Uppoint Cloud",
    description: "Production-oriented cloud platform foundation for cloud.uppoint.com.tr",
  },
  header: {
    brand: "Uppoint Cloud",
    home: "Home",
    locales: {
      tr: "TR",
      en: "EN",
    },
    theme: {
      switchToDark: "Dark theme",
      switchToLight: "Light theme",
    },
  },
  home: {
    domain: "cloud.uppoint.com.tr",
    title: "Authentication MVP Foundation",
    description:
      "Registration, login, logout, protected dashboard routing, and production serving setup are prepared in this milestone.",
    cta: {
      dashboard: "Go to dashboard",
      signIn: "Sign in",
      register: "Create account",
    },
  },
  login: {
    title: "Sign in",
    description: "Continue to the Uppoint Cloud application.",
    accountPrefix: "Account",
    footerPrefix: "New to Uppoint Cloud?",
    footerLink: "Create account",
    fields: {
      email: "Email or phone number",
      password: "Password",
    },
    nextIdle: "Next",
    backIdle: "Back",
    submitIdle: "Sign in",
    submitLoading: "Signing in...",
    errors: {
      unavailable: "Unable to sign in right now",
      invalidCredentials: "Invalid email or password",
    },
  },
  register: {
    title: "Create account",
    description: "Register to access cloud.uppoint.com.tr",
    footerPrefix: "Already have an account?",
    footerLink: "Sign in",
    fields: {
      name: "Name",
      email: "Email",
      phone: "Phone (optional)",
      phonePlaceholder: "+905551112233",
      password: "Password",
    },
    submitIdle: "Create account",
    submitLoading: "Creating account...",
    errors: {
      serverUnavailable: "Unable to contact the server",
      generic: "Unable to create account",
      autoSignInFailed: "Account created, but automatic sign-in failed",
      emailTaken: "An account with this email already exists",
      validationFailed: "Submitted data is invalid",
      invalidBody: "Invalid request body",
    },
  },
  dashboard: {
    title: "Dashboard",
    description: "Authenticated placeholder for upcoming VPS platform features.",
    cardTitle: "Authenticated session active",
    cardDescriptionPrefix: "You are logged in as",
    cardContent: "This page is intentionally minimal for the authentication MVP milestone.",
  },
  logout: {
    button: "Sign out",
  },
  validation: {
    phoneFormat: "Phone must be in international format",
    passwordMin: "Password must be at least 12 characters",
    passwordMax: "Password must be at most 72 characters",
    passwordLowercase: "Password must include a lowercase letter",
    passwordUppercase: "Password must include an uppercase letter",
    passwordNumber: "Password must include a number",
    passwordSymbol: "Password must include a symbol",
    nameMin: "Name must be at least 2 characters",
    loginPasswordRequired: "Password is required",
  },
  apiErrors: {
    invalidBody: "INVALID_BODY",
    validationFailed: "VALIDATION_FAILED",
    emailTaken: "EMAIL_TAKEN",
    registerFailed: "REGISTER_FAILED",
  },
} as const;
