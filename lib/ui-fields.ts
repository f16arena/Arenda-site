// Единый вид полей ввода, списков и подписей. Раньше в 17 файлах были свои
// копии inputCls/labelCls с разной высотой, фоном и цветом фокуса.
// Использовать как className у <input>/<select>/<textarea> или через
// components/ui/field.tsx (NativeSelect, Field).

/** Поле ввода / системный список / textarea. */
export const FIELD_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"

/** Подпись над полем. */
export const LABEL_CLS = "mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
