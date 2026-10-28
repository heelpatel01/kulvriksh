'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField, TextField } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import styles from '../pages.module.css';

// The final enquiry fields and the anti-spam method are TBC (roadmap R4). This form checks
// input locally only; nothing is sent until the API endpoint exists (F-PUB-04).
type Errors = Partial<Record<'name' | 'contact' | 'message', string>>;

const TOPICS = [
  { value: 'workspace', label: 'Family workspace' },
  { value: 'research', label: 'Genealogy research' },
  { value: 'voices', label: 'Family voices' },
  { value: 'other', label: 'Something else' },
];

function validate(data: FormData): Errors {
  const errors: Errors = {};
  const name = String(data.get('name') ?? '').trim();
  const contact = String(data.get('contact') ?? '').trim();
  const message = String(data.get('message') ?? '').trim();
  if (name.length < 2) {
    errors.name = 'Enter your name.';
  }
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isMobile = /^(\+91[\s-]?)?[6-9]\d{9}$/.test(contact.replace(/\s/g, ''));
  if (!isEmail && !isMobile) {
    errors.contact = 'Enter an email address or a 10-digit Indian mobile number.';
  }
  if (message.length < 10) {
    errors.message = 'Tell us a little more (at least 10 characters).';
  }
  return errors;
}

export function EnquiryForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(new FormData(event.currentTarget));
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    setSubmitted(true);
    event.currentTarget.reset();
  }

  if (submitted) {
    return (
      <div className={styles.formStack}>
        <Notice tone="success" title="Your enquiry passed the checks">
          This is a local preview, so the enquiry was not sent or stored. When the service is live, our team will reply
          using the contact details you provide.
        </Notice>
        <div>
          <Button variant="secondary" onClick={() => setSubmitted(false)}>
            Write another enquiry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.formStack} onSubmit={onSubmit} noValidate>
      <TextField id="enquiry-name" name="name" label="Your name" autoComplete="name" required error={errors.name} />
      <TextField
        id="enquiry-contact"
        name="contact"
        label="Email or mobile number"
        autoComplete="email"
        hint="We will only use this to reply to you."
        required
        error={errors.contact}
      />
      <SelectField id="enquiry-topic" name="topic" label="Topic" options={TOPICS} defaultValue="research" />
      <TextareaField id="enquiry-message" name="message" label="Your message" required error={errors.message} />
      <div>
        <Button type="submit" size="lg">
          Send enquiry
        </Button>
      </div>
    </form>
  );
}
