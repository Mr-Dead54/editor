// This import is relative so the compiler types build correctly
import { FileSystem } from '../../FileSystem/FileSystem'
import { TCompilerPlugin } from './TCompilerPlugin'

export type TCompilerPluginFactory<
	T = {
		mode: 'dev' | 'build'
		isFileRequest: boolean
		restartDevServer: boolean
		[key: string]: any
	}
> = (context: {
	options: T
	fileSystem: FileSystem
	outputFileSystem: FileSystem
	hasComMojangDirectory: boolean
	compileFiles: (files: string[]) => Promise<void>
	getAliases: (filePath: string) => string[]
	targetVersion: string
}) => Partial<TCompilerPlugin>
