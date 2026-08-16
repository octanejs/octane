import { useContext } from 'octane/universal/native';
import StdoutContext from '../components/StdoutContext.js';

/**
A React hook that returns the stdout stream where Ink renders your app.
*/
const useStdout = () => useContext(StdoutContext);
export default useStdout;
