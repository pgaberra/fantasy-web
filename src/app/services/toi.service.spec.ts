import { MockBuilder, MockRender } from 'ng-mocks';
import { ToiService } from './toi.service';

describe('ToiService', () => {
  beforeEach(() => MockBuilder(ToiService));

  const getService = () => MockRender(ToiService).point.componentInstance;

  describe('formatToi', () => {
    it('should format total seconds as mm:ss', () => {
      expect(getService().formatToi(1555)).toEqual('25:55');
    });

    it('should pad single-digit seconds with a leading zero', () => {
      expect(getService().formatToi(1260)).toEqual('21:00');
    });

    it('should handle a value with non-zero seconds below 10', () => {
      expect(getService().formatToi(1203)).toEqual('20:03');
    });
  });

  describe('parseToi', () => {
    it('should parse mm:ss format into total seconds', () => {
      expect(getService().parseToi('25:55')).toEqual(1555);
    });

    it('should parse a plain numeric string as a number', () => {
      expect(getService().parseToi('1555')).toEqual(1555);
    });

    it('should return 0 for 0:00', () => {
      expect(getService().parseToi('0:00')).toEqual(0);
    });
  });
});
