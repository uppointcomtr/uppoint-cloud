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

// Sort longest-first so "+971" is matched before "+1" (prefix overlap fix)
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function parseValue(value: string): { countryCode: string; localNumber: string } {
  for (const { code } of SORTED_CODES) {
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
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const currentIndex = COUNTRY_CODES.findIndex((c) => c.code === value);
  const selected = COUNTRY_CODES[currentIndex] ?? COUNTRY_CODES[0];

  // Close on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Focus listbox and scroll active item into view when dropdown opens
  useEffect(() => {
    if (!open) return;
    listboxRef.current?.focus();
    const items = listboxRef.current?.querySelectorAll("[role='option']");
    const activeItem = items?.[activeIndex] as HTMLElement | undefined;
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openDropdown() {
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
    setOpen(true);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDropdown();
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % COUNTRY_CODES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + COUNTRY_CODES.length) % COUNTRY_CODES.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const chosen = COUNTRY_CODES[activeIndex];
      if (chosen) onChange(chosen.code);
      setOpen(false);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative h-full">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        onBlur={onBlur}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-full items-center gap-1.5 border-r border-input px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="font-medium">{selected.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`country-option-${activeIndex}`}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-52 w-32 overflow-auto rounded-md border border-border bg-popover shadow-md focus:outline-none"
        >
          {COUNTRY_CODES.map(({ code, label }, i) => (
            <div
              key={code}
              id={`country-option-${i}`}
              role="option"
              aria-selected={code === value}
              onMouseDown={() => {
                onChange(code);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm text-popover-foreground ${
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : code === value
                    ? "bg-accent/40 font-medium"
                    : "hover:bg-accent hover:text-accent-foreground"
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
  const countryCode = parsed.countryCode;
  const localNumber = parsed.localNumber;

  function handleCodeChange(newCode: string) {
    onChange(newCode + localNumber);
  }

  function handleNumberChange(newNumber: string) {
    const digitsOnly = newNumber.replace(/\D/g, "");
    const stripped = digitsOnly.replace(/^0+/, "");
    onChange(countryCode + stripped);
  }

  return (
    <div className="flex h-12 w-full overflow-visible rounded-md border border-input bg-transparent shadow-xs transition-colors focus-within:outline-none focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
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
