import { MockBuilder, MockRender } from 'ng-mocks';
import { ToiService } from './toi.service';

describe('ToiService', () => {
  beforeEach(() => MockBuilder(ToiService));

  const getService = () => MockRender(ToiService).point.componentInstance;

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

    it('should return 0 for invalid input', () => {
      expect(getService().parseToi('random')).toEqual(0);
    });

    it('should return 0 for empty string', () => {
      expect(getService().parseToi('')).toEqual(0);
    });

    it('should return 0 for seconds with too many digits', () => {
      expect(getService().parseToi('0:00000000000000000000')).toEqual(0);
    });

    it('should return 0 for time with trailing invalid characters', () => {
      expect(getService().parseToi('5:35dsadasdassad')).toEqual(0);
    });
  });
});
