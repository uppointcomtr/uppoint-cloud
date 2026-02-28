"use client";

import { useState } from "react";

const COUNTRY_CODES = [
  { code: "+90",  label: "🇹🇷 +90"  },
  { code: "+1",   label: "🇺🇸 +1"   },
  { code: "+44",  label: "🇬🇧 +44"  },
  { code: "+49",  label: "🇩🇪 +49"  },
  { code: "+33",  label: "🇫🇷 +33"  },
  { code: "+31",  label: "🇳🇱 +31"  },
  { code: "+32",  label: "🇧🇪 +32"  },
  { code: "+34",  label: "🇪🇸 +34"  },
  { code: "+39",  label: "🇮🇹 +39"  },
  { code: "+41",  label: "🇨🇭 +41"  },
  { code: "+43",  label: "🇦🇹 +43"  },
  { code: "+46",  label: "🇸🇪 +46"  },
  { code: "+47",  label: "🇳🇴 +47"  },
  { code: "+48",  label: "🇵🇱 +48"  },
  { code: "+61",  label: "🇦🇺 +61"  },
  { code: "+81",  label: "🇯🇵 +81"  },
  { code: "+82",  label: "🇰🇷 +82"  },
  { code: "+86",  label: "🇨🇳 +86"  },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+966", label: "🇸🇦 +966" },
] as const;

const DEFAULT_CODE = "+90";

function parseValue(value: string): { countryCode: string; localNumber: string } {
  for (const { code } of COUNTRY_CODES) {
    if (value.startsWith(code)) {
      return { countryCode: code, localNumber: value.slice(code.length) };
    }
  }
  return { countryCode: DEFAULT_CODE, localNumber: value };
}

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export function PhoneInput({ id, value, onChange, onBlur }: PhoneInputProps) {
  const parsed = parseValue(value);
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [localNumber, setLocalNumber] = useState(parsed.localNumber);

  function handleCodeChange(newCode: string) {
    setCountryCode(newCode);
    onChange(newCode + localNumber);
  }

  function handleNumberChange(newNumber: string) {
    const digitsOnly = newNumber.replace(/\D/g, "");
    const stripped = digitsOnly.replace(/^0+/, "");
    setLocalNumber(stripped);
    onChange(countryCode + stripped);
  }

  return (
    <div className="flex h-9 w-full overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-colors focus-within:outline-none focus-within:ring-[3px] focus-within:ring-ring/50">
      <select
        value={countryCode}
        onChange={(e) => handleCodeChange(e.target.value)}
        onBlur={onBlur}
        className="border-r border-input bg-transparent px-2 text-sm text-foreground focus:outline-none"
        aria-label="Country code"
      >
        {COUNTRY_CODES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        autoComplete="tel-national"
        value={localNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        onBlur={onBlur}
        placeholder="5551112233"
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
