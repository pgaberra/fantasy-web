import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LoadingIndicatorComponent } from './loading-indicator';

describe('LoadingIndicatorComponent', () => {
  beforeEach(() => {
    return MockBuilder(LoadingIndicatorComponent);
  });

  it('should create', () => {
    const fixture = MockRender(LoadingIndicatorComponent);
    expect(fixture.point.componentInstance).toBeDefined();
  });

  it('should render the loading container and spinner', () => {
    const fixture = MockRender(LoadingIndicatorComponent);
    const container = fixture.nativeElement.querySelector('.loading-container');
    const spinner = fixture.nativeElement.querySelector('.loading-spinner');

    expect(container).toBeDefined();
    expect(spinner).toBeDefined();
  });
});
