import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from "lucide-react";
import { useLanguage } from "../../lib/i18n.jsx";

const MONTHS_KM = [
  "មករា",
  "កុម្ភៈ",
  "មីនា",
  "មេសា",
  "ឧសភា",
  "មិថុនា",
  "កក្កដា",
  "សីហា",
  "កញ្ញា",
  "តុលា",
  "វិច្ឆិកា",
  "ធ្នូ",
];

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS_KM = ["អា", "ច", "អ", "ព", "ព្រ", "សុ", "ស"];
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseDateIso(val) {
  if (!val || typeof val !== "string") return null;
  const parts = val.trim().split("T")[0].split("-");
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m, d);
}

function formatDateToIso(date) {
  if (!date || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function parseTimePart(val) {
  if (!val || typeof val !== "string" || !val.includes("T")) {
    return { hour: 12, minute: 0, ampm: "PM" };
  }
  const timeStr = val.split("T")[1] || "";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { hour: h, minute: m, ampm };
}

/**
 * Modern Admin Date & Time Picker
 * 
 * Features:
 * - Brand-aligned styling (Gold accent, clean typography, dark-mode ready)
 * - Portal rendering with smart vertical viewport collision detection
 * - Khmer & English bilingual calendar (Months, Weekdays, Today/Clear actions)
 * - Quick jump selectors for Month & Year
 * - Optional time picker support (`enableTime={true}`)
 * - Quick presets: Today (ថ្ងៃនេះ), Yesterday (ម្សិលមិញ), Clear (សម្អាត)
 * - Min / Max boundaries enforcement
 */
export default function AdminDatePicker({
  value = "",
  onChange,
  min = "",
  max = "",
  placeholder = "",
  disabled = false,
  className = "",
  wrapperClassName = "",
  ariaLabel = "",
  enableTime = false,
  clearable = true,
  id,
  name,
  style,
  required = false,
}) {
  const { language, t } = useLanguage();
  const isKm = String(language || "").toLowerCase().startsWith("k");
  const pickerId = useId();
  const actualId = id || pickerId;

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState(null);

  const selectedDate = useMemo(() => parseDateIso(value), [value]);
  const minDate = useMemo(() => parseDateIso(min), [min]);
  const maxDate = useMemo(() => parseDateIso(max), [max]);

  // View state for navigating calendar
  const [viewYear, setViewYear] = useState(() => (selectedDate ? selectedDate.getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ? selectedDate.getMonth() : new Date().getMonth()));

  // Time state if enableTime is true
  const initialTime = useMemo(() => parseTimePart(value), [value]);
  const [selectedHour, setSelectedHour] = useState(initialTime.hour);
  const [selectedMinute, setSelectedMinute] = useState(initialTime.minute);
  const [selectedAmPm, setSelectedAmPm] = useState(initialTime.ampm);

  // Sync view state when selected date changes
  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
  }, [value]);

  const months = isKm ? MONTHS_KM : MONTHS_EN;
  const weekdays = isKm ? WEEKDAYS_KM : WEEKDAYS_EN;

  // Reposition floating calendar popover
  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popoverHeight = enableTime ? 380 : 330;
    const popoverWidth = 280;

    const shouldOpenUp = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    setPopoverStyle({
      position: "fixed",
      left,
      width: popoverWidth,
      zIndex: 99999,
      ...(shouldOpenUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPopoverStyle(null);
      return;
    }
    updatePosition();
  }, [open, enableTime]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  // Click outside and Escape handling
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Broadcast event to close other date pickers when this opens
  const openPicker = () => {
    if (disabled) return;
    document.dispatchEvent(new CustomEvent("adminDatePickerOpen", { detail: { id: actualId } }));
    setOpen(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id !== actualId) {
        setOpen(false);
      }
    };
    document.addEventListener("adminDatePickerOpen", handler);
    return () => document.removeEventListener("adminDatePickerOpen", handler);
  }, [actualId]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build calendar matrix
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const calendarDays = useMemo(() => {
    const days = [];
    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(viewYear, viewMonth - 1, prevMonthDays - i),
      });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(viewYear, viewMonth, i),
      });
    }
    // Next month filler days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(viewYear, viewMonth + 1, i),
      });
    }
    return days;
  }, [viewYear, viewMonth, daysInMonth, firstDayIndex, prevMonthDays]);

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => formatDateToIso(today), [today]);

  const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDayDisabled = (d) => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  const commitDate = (date, customHour, customMinute, customAmPm) => {
    if (!date) {
      onChange?.("");
      setOpen(false);
      return;
    }
    let dateStr = formatDateToIso(date);
    if (enableTime) {
      const hVal = customHour !== undefined ? customHour : selectedHour;
      const mVal = customMinute !== undefined ? customMinute : selectedMinute;
      const ampmVal = customAmPm !== undefined ? customAmPm : selectedAmPm;
      let h = hVal;
      if (ampmVal === "PM" && h < 12) h += 12;
      if (ampmVal === "AM" && h === 12) h = 0;
      dateStr += `T${pad2(h)}:${pad2(mVal)}`;
    }
    onChange?.(dateStr);
    if (!enableTime) {
      setOpen(false);
    }
  };

  const handleSelectDay = (dayObj) => {
    if (isDayDisabled(dayObj.date)) return;
    commitDate(dayObj.date);
  };

  const handleSelectToday = () => {
    commitDate(today);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange?.("");
    setOpen(false);
  };

  // Year choices (-30 to +10 years)
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list = [];
    for (let y = currentYear - 30; y <= currentYear + 10; y++) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // Formatted display value in trigger
  const displayLabel = useMemo(() => {
    if (!selectedDate) return "";
    const y = selectedDate.getFullYear();
    const mName = months[selectedDate.getMonth()];
    const d = selectedDate.getDate();
    let label = isKm ? `${d} ${mName} ${y}` : `${mName.slice(0, 3)} ${d}, ${y}`;
    if (enableTime && value.includes("T")) {
      const { hour, minute, ampm } = initialTime;
      label += ` ${pad2(hour)}:${pad2(minute)} ${ampm}`;
    }
    return label;
  }, [selectedDate, isKm, months, enableTime, value, initialTime]);

  const popover =
    open && popoverStyle ? (
      <div
        ref={popoverRef}
        style={popoverStyle}
        onMouseDown={(e) => e.stopPropagation()}
        className="rounded-2xl border border-slate-200/95 bg-white p-3.5 shadow-2xl shadow-slate-900/15 ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50 dark:ring-white/10 select-none animate-in fade-in-50 zoom-in-95 duration-150"
      >
        {/* Header: Month & Year Controls */}
        <div className="flex items-center justify-between gap-1 pb-3 border-b border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-100">
            {/* Month select */}
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 py-1 rounded-md cursor-pointer outline-none font-semibold text-xs transition-colors"
            >
              {months.map((m, idx) => (
                <option key={idx} value={idx} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  {m}
                </option>
              ))}
            </select>

            {/* Year select */}
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 py-1 rounded-md cursor-pointer outline-none font-semibold text-xs tabular-nums transition-colors"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 gap-1 pt-2.5 pb-1 text-center">
          {weekdays.map((w, idx) => (
            <span
              key={idx}
              className={`text-[11px] font-bold ${
                idx === 0
                  ? "text-rose-500/90 dark:text-rose-400/90"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {w}
            </span>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            const isSelected = selectedDate ? isSameDay(cell.date, selectedDate) : false;
            const isToday = isSameDay(cell.date, today);
            const disabledDay = isDayDisabled(cell.date);

            let dayClasses = "flex h-8 w-8 items-center justify-center rounded-xl text-xs font-semibold tabular-nums transition-all select-none ";

            if (disabledDay) {
              dayClasses += "text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40 ";
            } else if (isSelected) {
              dayClasses += "bg-[color:var(--admin-primary,#C59B27)] text-white font-bold shadow-sm scale-105 ";
            } else if (!cell.isCurrentMonth) {
              dayClasses += "text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer ";
            } else if (isToday) {
              dayClasses += "text-[color:var(--admin-primary,#C59B27)] font-bold ring-1 ring-[color:var(--admin-primary,#C59B27)]/60 bg-[rgba(var(--admin-primary-rgb,197,155,39),0.08)] hover:bg-[rgba(var(--admin-primary-rgb,197,155,39),0.18)] cursor-pointer ";
            } else {
              dayClasses += "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer ";
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={disabledDay}
                onClick={() => handleSelectDay(cell)}
                className={dayClasses}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {/* Optional Time Selector */}
        {enableTime && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
              <Clock className="h-3.5 w-3.5" />
              {isKm ? "ម៉ោង:" : "Time:"}
            </span>
            <div className="flex items-center gap-1">
              <select
                value={selectedHour}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setSelectedHour(h);
                  commitDate(selectedDate || today, h, selectedMinute, selectedAmPm);
                }}
                className="h-7 px-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold tabular-nums outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                value={selectedMinute}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setSelectedMinute(m);
                  commitDate(selectedDate || today, selectedHour, m, selectedAmPm);
                }}
                className="h-7 px-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold tabular-nums outline-none"
              >
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const nextAmPm = selectedAmPm === "AM" ? "PM" : "AM";
                  setSelectedAmPm(nextAmPm);
                  commitDate(selectedDate || today, selectedHour, selectedMinute, nextAmPm);
                }}
                className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors"
              >
                {selectedAmPm}
              </button>
            </div>
          </div>
        )}

        {/* Footer shortcuts: Today & Clear */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleClear}
            className="text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 font-semibold transition-colors"
          >
            {isKm ? "សម្អាត" : "Clear"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-[color:var(--admin-primary,#C59B27)] hover:underline font-bold transition-colors"
            >
              {isKm ? "ថ្ងៃនេះ" : "Today"}
            </button>
            {enableTime && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-0.5 rounded-md bg-[color:var(--admin-primary,#C59B27)] text-white font-bold text-xs shadow-sm hover:opacity-90 transition-opacity"
              >
                {isKm ? "រួចរាល់" : "Done"}
              </button>
            )}
          </div>
        </div>
      </div>
    ) : null;

  const resolvedWrapperClass = useMemo(() => {
    if (wrapperClassName) return wrapperClassName;
    const widthMatches = className.match(
      /\b((?:sm:|md:|lg:|xl:)?(?:w-|min-w-|max-w-|basis-|shrink|flex-)[^\s]+)\b/g
    );
    if (widthMatches && widthMatches.length > 0) {
      return widthMatches.join(" ");
    }
    return "w-full";
  }, [wrapperClassName, className]);

  return (
    <div className={`relative inline-block min-w-0 ${resolvedWrapperClass}`.trim()}>
      {name && <input type="hidden" name={name} value={value || ""} required={required} />}
      <div
        ref={triggerRef}
        id={id}
        style={style}
        onClick={open ? () => setOpen(false) : openPicker}
        className={`group relative flex h-10 w-full items-center rounded-lg border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-800 shadow-sm transition hover:border-slate-300 focus-within:border-[color:var(--admin-primary,#C59B27)] focus-within:ring-2 focus-within:ring-[color:var(--admin-primary,#C59B27)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 cursor-pointer select-none ${
          disabled ? "opacity-50 pointer-events-none" : ""
        } ${className}`.trim()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open ? setOpen(false) : openPicker();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder || "Choose date"}
      >
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-slate-400 group-hover:text-[color:var(--admin-primary,#C59B27)] transition-colors" />

        <span
          className={`min-w-0 flex-1 truncate font-medium ${
            displayLabel
              ? "text-slate-800 dark:text-slate-100 font-semibold"
              : "text-slate-400 dark:text-slate-500 font-normal"
          }`}
        >
          {displayLabel || placeholder || (isKm ? "ជ្រើសរើសកាលបរិច្ឆេទ" : "Select date")}
        </span>

        {/* Clear Button (appears when value is set) */}
        {clearable && Boolean(value) && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="mr-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            title={isKm ? "សម្អាត" : "Clear"}
            aria-label="Clear date"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-[color:var(--admin-primary,#C59B27)]" : ""
          }`}
        />
      </div>

      {typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
