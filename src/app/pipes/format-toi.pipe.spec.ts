import { MockBuilder, MockRender } from 'ng-mocks';
import { FormatToiPipe } from './format-toi.pipe';

describe('FormatToiPipe', () => {
  beforeEach(() => MockBuilder(FormatToiPipe));

  it('should format total seconds as mm:ss', () => {
    const fixture = MockRender('{{ value | formatToi }}', { value: 1555 });
    expect(fixture.nativeElement.textContent).toEqual('25:55');
  });

  it('should pad single-digit seconds with a leading zero', () => {
    const fixture = MockRender('{{ value | formatToi }}', { value: 1260 });
    expect(fixture.nativeElement.textContent).toEqual('21:00');
  });

  it('should handle a value with non-zero seconds below 10', () => {
    const fixture = MockRender('{{ value | formatToi }}', { value: 1203 });
    expect(fixture.nativeElement.textContent).toEqual('20:03');
  });

  it('should handle NaN by returning 0:00', () => {
    const fixture = MockRender('{{ value | formatToi }}', { value: NaN });
    expect(fixture.nativeElement.textContent).toEqual('0:00');
  });

  it('should handle 0 by returning 0:00', () => {
    const fixture = MockRender('{{ value | formatToi }}', { value: 0 });
    expect(fixture.nativeElement.textContent).toEqual('0:00');
  });
});
