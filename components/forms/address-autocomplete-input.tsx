"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { AddressSuggestion } from "@/lib/address-suggestions"

type AddressFields = {
  countryCode?: string | null
  region?: string | null
  city?: string | null
  settlement?: string | null
  street?: string | null
  houseNumber?: string | null
  postcode?: string | null
  latitude?: number | null
  longitude?: number | null
  source?: string | null
  sourceId?: string | null
}

type Props = {
  name: string
  defaultValue?: string | null
  defaultFields?: AddressFields
  required?: boolean
  placeholder?: string
  className?: string
  includeStructuredFields?: boolean
}

const EMPTY_FIELDS: Required<AddressFields> = {
  countryCode: "kz",
  region: "",
  city: "",
  settlement: "",
  street: "",
  houseNumber: "",
  postcode: "",
  latitude: null,
  longitude: null,
  source: "",
  sourceId: "",
}

export function AddressAutocompleteInput({
  name,
  defaultValue,
  defaultFields,
  required,
  placeholder = "г. Усть-Каменогорск, ул. ...",
  className,
  includeStructuredFields = true,
}: Props) {
  const initialValue = defaultValue ?? ""
  const [value, setValue] = useState(initialValue)
  const [fields, setFields] = useState<AddressFields>({ ...EMPTY_FIELDS, ...defaultFields })
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const query = useMemo(() => value.trim(), [value])

  useEffect(() => {
    if (query.length < 3) {
      return
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)

      try {
        const response = await fetch(`/api/addresses/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          setSuggestions([])
          return
        }
        const data = await response.json()
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
        setOpen(true)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
    }
  }, [query])

  function handleManualChange(nextValue: string) {
    setValue(nextValue)
    setOpen(true)
    if (nextValue.trim().length < 3) {
      setSuggestions([])
      setLoading(false)
      setOpen(false)
    }
    if (nextValue !== initialValue) {
      setFields({ ...EMPTY_FIELDS, countryCode: "kz" })
    }
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    setValue(suggestion.displayName)
    setFields({
      countryCode: suggestion.countryCode,
      region: suggestion.region,
      city: suggestion.city,
      settlement: suggestion.settlement,
      street: suggestion.street,
      houseNumber: suggestion.houseNumber,
      postcode: suggestion.postcode,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      source: suggestion.source,
      sourceId: suggestion.sourceId,
    })
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        required={required}
        autoComplete="street-address"
        placeholder={placeholder}
        className={className}
        onChange={(event) => handleManualChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150)
        }}
      />
      {includeStructuredFields && <AddressHiddenFields fields={fields} />}

      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-[60] mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Ищем адрес...</div>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-blue-500/10"
            >
              <span className="block text-sm text-slate-900 dark:text-slate-100">{suggestion.displayName}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {[suggestion.city, suggestion.settlement, suggestion.street, suggestion.houseNumber].filter(Boolean).join(" · ") || "Казахстан"}
              </span>
            </button>
          ))}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 text-[11px] text-slate-400 hover:text-blue-600 dark:text-slate-500"
          >
            © OpenStreetMap contributors
          </a>
        </div>
      )}
    </div>
  )
}

function AddressHiddenFields({ fields }: { fields: AddressFields }) {
  return (
    <>
      <input type="hidden" name="addressCountryCode" value={fields.countryCode ?? "kz"} />
      <input type="hidden" name="addressRegion" value={fields.region ?? ""} />
      <input type="hidden" name="addressCity" value={fields.city ?? ""} />
      <input type="hidden" name="addressSettlement" value={fields.settlement ?? ""} />
      <input type="hidden" name="addressStreet" value={fields.street ?? ""} />
      <input type="hidden" name="addressHouseNumber" value={fields.houseNumber ?? ""} />
      <input type="hidden" name="addressPostcode" value={fields.postcode ?? ""} />
      <input type="hidden" name="addressLatitude" value={fields.latitude ?? ""} />
      <input type="hidden" name="addressLongitude" value={fields.longitude ?? ""} />
      <input type="hidden" name="addressSource" value={fields.source ?? ""} />
      <input type="hidden" name="addressSourceId" value={fields.sourceId ?? ""} />
    </>
  )
}
