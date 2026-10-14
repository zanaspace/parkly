import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Input, Text } from './index.js';

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
