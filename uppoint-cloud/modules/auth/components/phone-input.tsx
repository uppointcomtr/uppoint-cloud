"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const COUNTRY_CODES = [
  { code: "+90",  label: "TR +90"  },
  { code: "+1",   label: "US +1"   },
  { code: "+44",  label: "GB +44"  },
  { code: "+49",  label: "DE +49"  },
  { code: "+33",  label: "FR +33"  },
  { code: "+31",  label: "NL +31"  },
  { code: "+32",  label: "BE +32"  },
  { code: "+34",  label: "ES +34"  },
  { code: "+39",  label: "IT +39"  },
  { code: "+41",  label: "CH +41"  },
  { code: "+43",  label: "AT +43"  },
  { code: "+46",  label: "SE +46"  },
  { code: "+47",  label: "NO +47"  },
  { code: "+48",  label: "PL +48"  },
  { code: "+61",  label: "AU +61"  },
  { code: "+81",  label: "JP +81"  },
  { code: "+82",  label: "KR +82"  },
  { code: "+86",  label: "CN +86"  },
  { code: "+971", label: "AE +971" },
  { code: "+966", label: "SA +966" },
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

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  onBlur: () => void;
}

function CountrySelect({ value, onChange, onBlur }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];

  return (
    <div ref={containerRef} className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={onBlur}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-full items-center gap-1.5 border-r border-input px-3 text-sm text-foreground focus:outline-none"
      >
        <span className="font-medium">{selected.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-52 w-32 overflow-auto rounded-md border border-border bg-popover shadow-md"
        >
          {COUNTRY_CODES.map(({ code, label }) => (
            <div
              key={code}
              role="option"
              aria-selected={code === value}
              onMouseDown={() => {
                onChange(code);
                setOpen(false);
              }}
              className={`cursor-pointer px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground ${
                code === value ? "bg-accent/40 font-medium" : ""
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
    <div className="flex h-12 w-full overflow-visible rounded-md border border-input bg-transparent shadow-xs transition-colors focus-within:outline-none focus-within:ring-[3px] focus-within:ring-ring/50">
      <CountrySelect value={countryCode} onChange={handleCodeChange} onBlur={onBlur} />
      <input
        id={id}
        type="tel"
        autoComplete="tel-national"
        value={localNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        onBlur={onBlur}
        placeholder="5551112233"
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
