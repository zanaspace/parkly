import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Input, Select, Text } from './index.js';

afterEach(cleanup);

describe('Button', () => {
  it('renders a primary button that calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Book now</Button>);
    const button = screen.getByRole('button', { name: 'Book now' });
    expect(button.className).toContain('pk-button--primary');
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stays focusable but ignores presses when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Pay
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Pay' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('announces loading and is busy', () => {
    render(<Button loading>Pay</Button>);
    const button = screen.getByRole('button', { name: 'Loading' });
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Input', () => {
  it('links label, helper and error for assistive tech', () => {
    render(<Input label="Plate number" helper="As shown on the car" error="Enter a valid plate" />);
    const input = screen.getByLabelText('Plate number');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
    expect(screen.getByRole('alert').textContent).toBe('Error: Enter a valid plate');
  });

  it('omits aria-invalid without an error', () => {
    render(<Input label="Name" />);
    expect(screen.getByLabelText('Name').hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('Text', () => {
  it('maps headings to semantic elements and type tokens', () => {
    render(<Text variant="heading-xl">Find parking</Text>);
    const heading = screen.getByRole('heading', { level: 1, name: 'Find parking' });
    expect(heading.style.fontSize).toBe('var(--pk-type-heading-xl-font-size)');
  });

  it('uses tabular numbers for prices', () => {
    render(<Text variant="price-md">₦1,500</Text>);
    expect(screen.getByText('₦1,500').className).toContain('pk-text--tabular');
  });
});

describe('Select', () => {
  it('is labelled, shows a disabled placeholder and announces its error', () => {
    render(
      <Select
        label="Business type"
        name="type"
        defaultValue=""
        placeholder="Choose one"
        options={[
          { value: 'HOTEL', label: 'Hotel' },
          { value: 'OFFICE', label: 'Office building' },
        ]}
        error="Choose a business type."
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Business type' });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('option', { name: 'Choose one' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Choose a business type.');
    expect(select.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});
