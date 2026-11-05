from pathlib import Path
import ast
import sys
import types
import unittest
from unittest.mock import Mock, patch

# Load only the translation helpers: the tool's stdin entry point must not run.
source = ast.parse((Path(__file__).resolve().parents[1] / 'content_tools.py').read_text(encoding='utf-8'))
helpers = ast.Module(body=[node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ('local_translation', 'install_translation')], type_ignores=[])

class LocalTranslationTests(unittest.TestCase):
    def setUp(self):
        self.translate = types.ModuleType('argostranslate.translate')
        self.package = types.ModuleType('argostranslate.package')
        self.argos = types.ModuleType('argostranslate')
        self.argos.translate = self.translate
        self.argos.package = self.package
        self.modules = patch.dict(sys.modules, {'argostranslate': self.argos, 'argostranslate.translate': self.translate, 'argostranslate.package': self.package})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.scope = {'LANGUAGE': 'fi', 'LANGUAGE_NAME': 'Finnish'}
        exec(compile(helpers, 'content_tools.py', 'exec'), self.scope)
        self.target = types.SimpleNamespace(code='en')
        self.model = Mock()
        self.model.translate.return_value = 'Hello'
        self.language = Mock(code='fi')
        self.language.get_translation.return_value = self.model
        self.download = Mock(from_code='fi', to_code='en')
        self.package.update_package_index = Mock()
        self.package.get_available_packages = Mock(return_value=[self.download])
        self.package.install_from_path = Mock()

    def test_existing_model_translates_without_download(self):
        self.translate.get_installed_languages = Mock(return_value=[self.language, self.target])
        self.assertEqual(self.scope['local_translation']('Hei')['text'], 'Hello')
        self.package.update_package_index.assert_not_called()

    def test_missing_model_downloads_then_translates(self):
        self.translate.get_installed_languages = Mock(side_effect=[[], [self.language, self.target]])
        self.assertEqual(self.scope['local_translation']('Hei')['text'], 'Hello')
        self.package.install_from_path.assert_called_once_with(self.download.download.return_value)

    def test_missing_route_downloads_instead_of_dereferencing_none(self):
        self.language.get_translation.side_effect = [None, self.model]
        self.translate.get_installed_languages = Mock(return_value=[self.language, self.target])
        self.assertEqual(self.scope['local_translation']('Hei')['text'], 'Hello')
        self.package.install_from_path.assert_called_once()

    def test_download_failure_has_recovery_message(self):
        self.translate.get_installed_languages = Mock(return_value=[])
        self.package.update_package_index.side_effect = OSError('offline')
        with self.assertRaisesRegex(ValueError, 'Settings.*Offline tools'):
            self.scope['local_translation']('Hei')

    def test_traditional_chinese_uses_argos_chinese_code(self):
        self.scope['LANGUAGE'] = 'zh-Hant'
        self.language.code = 'zh'
        self.translate.get_installed_languages = Mock(return_value=[self.language, self.target])
        self.scope['local_translation']('你好')
        self.model.translate.assert_called_once_with('你好')

    def test_english_requires_no_model(self):
        self.scope['LANGUAGE'] = 'en'
        self.assertEqual(self.scope['local_translation']('Hello')['text'], 'Hello')

if __name__ == '__main__':
    unittest.main()
