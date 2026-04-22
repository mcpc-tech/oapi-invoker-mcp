/**
 * Simple template string interpolator.
 * Replaces `{key}` placeholders (word chars and dots only) with corresponding
 * values from the provided object. Unmatched placeholders are left as-is.
 */
export function p(
  template: string,
): (values: Record<string, unknown>) => string {
  return (values) => {
    let result = template;
    const regex = /\{((\w|\.)+)\}/g;
    const names = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      names.add(match[1]);
    }
    for (const name of names) {
      const value = values[name];
      const re = new RegExp(`\\{${name}\\}`, "g");
      if (value !== undefined && value !== null) {
        result = result.replace(re, String(value));
      }
      // unmatched placeholders are left unchanged
    }
    return result;
  };
}
