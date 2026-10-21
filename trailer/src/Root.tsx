import { Composition } from 'remotion';
import { Trailer } from './trailer/Trailer';
import { TOTAL } from './trailer/theme';
import { Thumbnail } from './Thumbnail';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition id="TrailerWide" component={Trailer} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ orient: 'landscape' as const }} />
            <Composition id="TrailerTall" component={Trailer} durationInFrames={TOTAL} fps={30} width={1080} height={1920} defaultProps={{ orient: 'portrait' as const }} />
            <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={30} width={1024} height={1024} />
        </>
    );
};
