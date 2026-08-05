import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { PasswordRequirementsComponent } from './password-requirements';

describe('PasswordRequirementsComponent', () => {
  beforeEach(() => MockBuilder(PasswordRequirementsComponent));

  const render = (password: string) => MockRender(PasswordRequirementsComponent, { password });

  const metItems = () =>
    ngMocks
      .findAll('.password-policy-item')
      .filter((item) => (item.nativeElement as HTMLElement).classList.contains('met'));

  it('marks every requirement met for a compliant password', () => {
    render('Password1');

    expect(ngMocks.findAll('.password-policy-item')).toHaveLength(4);
    expect(metItems()).toHaveLength(4);
  });

  it('marks only the satisfied requirements for a weak password', () => {
    // "password" satisfies length and lowercase, but not uppercase or a number.
    render('password');

    expect(metItems()).toHaveLength(2);
  });

  it('marks nothing met for an empty password', () => {
    render('');

    expect(metItems()).toHaveLength(0);
  });

  it('announces the number of met requirements for screen readers', () => {
    const fixture = render('Password1');

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '4 of 4 password requirements met',
    );
  });
});
