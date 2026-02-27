import { redirect } from "next/navigation";

import { defaultLocale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

export default function RegisterRedirectPage() {
  redirect(withLocale("/register", defaultLocale));
}
