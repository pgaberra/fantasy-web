import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncedLineComponent } from './synced-line';

describe('SyncedLineComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [SyncedLineComponent] }));

  function render(inputs: {
    leagueName?: string | null;
    syncedAt?: string | null;
    disconnectable?: boolean;
  }) {
    const fixture = TestBed.createComponent(SyncedLineComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    const line = fixture.nativeElement.querySelector('.synced-line') as HTMLElement;
    return { fixture, line };
  }

  it('names the league and says when it was last synced, under the toolbar chip dot', () => {
    const { line } = render({ leagueName: 'HHL', syncedAt: '2026-08-14T17:12:00.000Z' });

    expect(line.textContent).toContain('Synced with');
    expect(line.querySelector('strong')?.textContent).toEqual('HHL');
    expect(line.textContent).toContain('Aug 14, 2026');
    expect(line.querySelector('.sync-dot')).toBeTruthy();
    expect(line.querySelector('button')).toBeNull();
  });

  it('says only that it is synced when the platform gave the league no name', () => {
    const { line } = render({ syncedAt: '2026-08-14T17:12:00.000Z' });

    expect(line.textContent).toContain('Synced');
    expect(line.textContent).not.toContain('Synced with');
    expect(line.querySelector('strong')).toBeNull();
  });

  it('leaves the date out where the host has none to give', () => {
    const { line } = render({ leagueName: 'HHL' });

    expect(line.textContent?.trim()).toEqual('Synced with HHL');
  });

  it('carries Disconnect only where the host owns the link, and says so when pressed', () => {
    const { fixture, line } = render({ leagueName: 'HHL', disconnectable: true });
    const disconnected = vi.fn();
    fixture.componentInstance.disconnected.subscribe(disconnected);

    const button = line.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toEqual('Disconnect');
    button.click();

    expect(disconnected).toHaveBeenCalled();
  });
});
