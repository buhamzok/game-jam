import { Composition } from 'remotion';
import { Trailer } from './trailer/Trailer';
import { TOTAL } from './trailer/theme';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition id="TrailerWide" component={Trailer} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ orient: 'landscape' as const }} />
            <Composition id="TrailerTall" component={Trailer} durationInFrames={TOTAL} fps={30} width={1080} height={1920} defaultProps={{ orient: 'portrait' as const }} />
        </>
    );
};
