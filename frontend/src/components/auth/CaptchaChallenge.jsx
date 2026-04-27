import { useMemo, useState } from 'react';

export default function CaptchaChallenge({ onSolved }) {
  const challenge = useMemo(() => {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 2;
    return { a, b, answer: a + b };
  }, []);
  const [value, setValue] = useState('');

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <label className="text-sm font-semibold text-amber-950">Security check: {challenge.a} + {challenge.b}</label>
      <div className="mt-2 flex gap-2">
        <input className="field" value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (Number(value) === challenge.answer) {
              onSolved(`local-captcha-ok-${Date.now()}`);
            }
          }}
        >
          Verify
        </button>
      </div>
    </div>
  );
}
